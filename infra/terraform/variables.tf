variable "aws_region" {
  description = "AWS region to deploy into. Stockholm is the closest region to Tartu, Estonia."
  type        = string
  default     = "eu-north-1"
}

variable "instance_type" {
  description = "EC2 instance size. t3.micro is the small/cheap tier — enough for two small Docker containers."
  type        = string
  default     = "t3.micro"
}

variable "project_name" {
  description = "Used to tag/name every resource this config creates, so they're easy to find and easy to tear down together."
  type        = string
  default     = "trump-card"
}

variable "ssh_public_key_path" {
  description = "Path to YOUR local SSH public key file (not private!). This gets uploaded to AWS so you can SSH into the instance. Generate one first if you don't have one — see README in this folder."
  type        = string
  default     = "~/.ssh/trump-card-aws.pub"
}

variable "my_ip_cidr" {
  description = <<-EOT
    Your current public IP, in CIDR form (e.g. "203.0.113.42/32").
    SSH (port 22) will ONLY be allowed from this address — not the whole
    internet. Find your IP at https://whatismyip.com and add /32 to the end.
    This is a deliberate security choice: opening SSH to 0.0.0.0/0 means
    every bot on the internet will hammer your instance with login attempts
    within minutes of it going live.
  EOT
  type        = string
}
