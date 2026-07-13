output "instance_public_ip" {
  description = "The server's public IP. This is what you SSH into, and what Ansible (Phase 6) will target."
  value       = aws_eip.app.public_ip
}

output "instance_id" {
  description = "AWS's internal ID for the instance — useful for the AWS Console or CLI lookups."
  value       = aws_instance.app.id
}

output "ssh_command" {
  description = "Copy-pasteable command to SSH in once the instance is up."
  value       = "ssh -i ~/.ssh/trump-card-aws ubuntu@${aws_eip.app.public_ip}"
}

output "security_group_id" {
  description = "The firewall's ID — useful if you need to add rules later via the console instead of Terraform."
  value       = aws_security_group.app.id
}
