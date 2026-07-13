terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ─── Find the latest official Ubuntu 24.04 LTS AMI ─────────────────────────
# Hardcoding an AMI ID is a common Terraform mistake — AMI IDs are specific
# to one region AND get replaced over time as Ubuntu ships patched images.
# This data block always resolves to whatever the current one actually is,
# in whichever region you deploy to.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical's official AWS account ID

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ─── Your SSH key, uploaded to AWS ──────────────────────────────────────────
resource "aws_key_pair" "deployer" {
  key_name   = "${var.project_name}-key"
  public_key = file(var.ssh_public_key_path)
}

# ─── Firewall rules ──────────────────────────────────────────────────────
resource "aws_security_group" "app" {
  name        = "${var.project_name}-sg"
  description = "Trump Card app server - SSH restricted to my IP, HTTP/HTTPS open to everyone"

  ingress {
    description = "SSH - only from my own IP"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.my_ip_cidr]
  }

  ingress {
    description = "HTTP - the actual game, open to the internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS - reserved for later if you add a domain + TLS cert"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound - needed to pull Docker images from ghcr.io, apt updates, etc."
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  } 

  tags = {
    Name    = "${var.project_name}-sg"
    Project = var.project_name
  }
}

# ─── The actual server ──────────────────────────────────────────────────
resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deployer.key_name
  vpc_security_group_ids = [aws_security_group.app.id]

  root_block_device {
    volume_size = 20 # GB — comfortably fits Ubuntu + Docker + both images
    volume_type = "gp3"
  }

  tags = {
    Name    = "${var.project_name}-server"
    Project = var.project_name
  }
}

# ─── Static IP ──────────────────────────────────────────────────────────
# Without this, the public IP changes every time the instance stops/starts.
# NOTE: this is free ONLY while attached to a running instance — if you
# ever `terraform apply` with the instance stopped (not this config's
# normal behavior, but worth knowing), an unattached/idle EIP does cost
# a small hourly fee.
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Name    = "${var.project_name}-eip"
    Project = var.project_name
  }
}
