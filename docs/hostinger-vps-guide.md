# Hostinger VPS Management Guide

## Table of Contents
1. [Initial Setup](#initial-setup)
2. [Application Management](#application-management)
3. [Nginx Configuration](#nginx-configuration)
4. [SSL Certificate Management](#ssl-certificate-management)
5. [Database Management](#database-management)
6. [Backup and Recovery](#backup-and-recovery)
7. [Monitoring and Logs](#monitoring-and-logs)
8. [Troubleshooting](#troubleshooting)

## Initial Setup

### Prerequisites
- Hostinger VPS with Ubuntu 22.04
- Domain name configured with DNS pointing to VPS
- SSH access to VPS
- Root or sudo privileges

### Server Setup
1. **Update System**
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

2. **Install Required Packages**
   ```bash
   sudo apt install -y nginx nodejs npm certbot python3-certbot-nginx
   ```

3. **Configure Firewall**
   ```bash
   sudo ufw allow 22
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw enable
   ```

## Application Management

### Deploying New Version
1. **Pull Latest Changes**
   ```bash
   cd /var/www/oliveit-stack
   git pull origin main
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build Application**
   ```bash
   npm run build
   ```

4. **Restart PM2**
   ```bash
   pm2 restart all
   ```

### Adding New Features
1. **Create New Branch**
   ```bash
   git checkout -b feature/new-feature-name
   ```

2. **Make Changes and Test Locally**
   - Implement new features
   - Test thoroughly
   - Commit changes

3. **Deploy to Production**
   ```bash
   git checkout main
   git merge feature/new-feature-name
   git push origin main
   # Follow deployment steps above
   ```

## Nginx Configuration

### Main Configuration
Location: `/etc/nginx/sites-available/oliveit-stack`
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Managing Nginx
```bash
# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx
```

## SSL Certificate Management

### Obtaining Certificate
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### Renewing Certificate
```bash
sudo certbot renew
```

### Auto-renewal Setup
```bash
sudo systemctl status certbot.timer
```

## Database Management

### MongoDB Operations
```bash
# Connect to MongoDB
mongosh "mongodb://localhost:27017"

# Backup Database
mongodump --db oliveit --out /backup/path

# Restore Database
mongorestore --db oliveit /backup/path/oliveit
```

### Regular Maintenance
```bash
# Check database status
sudo systemctl status mongod

# Restart MongoDB
sudo systemctl restart mongod
```

## Backup and Recovery

### Creating Backups
1. **Database Backup**
   ```bash
   # Create backup directory
   mkdir -p /backup/$(date +%Y%m%d)
   
   # Backup MongoDB
   mongodump --db oliveit --out /backup/$(date +%Y%m%d)/mongodb
   
   # Backup application files
   tar -czf /backup/$(date +%Y%m%d)/app.tar.gz /var/www/oliveit-stack
   ```

2. **Automated Backup Script**
   ```bash
   # Create backup script
   nano /usr/local/bin/backup.sh
   ```
   Add the following content:
   ```bash
   #!/bin/bash
   DATE=$(date +%Y%m%d)
   BACKUP_DIR="/backup/$DATE"
   mkdir -p $BACKUP_DIR
   
   # Backup MongoDB
   mongodump --db oliveit --out $BACKUP_DIR/mongodb
   
   # Backup application
   tar -czf $BACKUP_DIR/app.tar.gz /var/www/oliveit-stack
   
   # Remove old backups (older than 7 days)
   find /backup -type d -mtime +7 -exec rm -rf {} \;
   ```

### Restoring from Backup
```bash
# Restore MongoDB
mongorestore --db oliveit /backup/YYYYMMDD/mongodb/oliveit

# Restore application files
tar -xzf /backup/YYYYMMDD/app.tar.gz -C /
```

## Monitoring and Logs

### Application Logs
```bash
# View PM2 logs
pm2 logs

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# View MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log
```

### System Monitoring
```bash
# Check system resources
htop

# Check disk usage
df -h

# Check memory usage
free -h
```

## Troubleshooting

### Common Issues and Solutions

1. **Application Not Starting**
   ```bash
   # Check PM2 status
   pm2 status
   
   # View detailed logs
   pm2 logs
   ```

2. **Nginx Issues**
   ```bash
   # Check Nginx configuration
   sudo nginx -t
   
   # Check Nginx status
   sudo systemctl status nginx
   ```

3. **MongoDB Connection Issues**
   ```bash
   # Check MongoDB status
   sudo systemctl status mongod
   
   # Check MongoDB logs
   sudo tail -f /var/log/mongodb/mongod.log
   ```

4. **SSL Certificate Issues**
   ```bash
   # Check certificate status
   sudo certbot certificates
   
   # Force renewal
   sudo certbot renew --force-renewal
   ```

### Performance Optimization

1. **Nginx Optimization**
   ```bash
   # Edit Nginx configuration
   sudo nano /etc/nginx/nginx.conf
   ```
   Add these optimizations:
   ```nginx
   worker_processes auto;
   worker_connections 1024;
   keepalive_timeout 65;
   gzip on;
   gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
   ```

2. **Node.js Optimization**
   ```bash
   # Set Node.js memory limit
   export NODE_OPTIONS="--max-old-space-size=2048"
   ```

3. **MongoDB Optimization**
   ```bash
   # Edit MongoDB configuration
   sudo nano /etc/mongod.conf
   ```
   Add these optimizations:
   ```yaml
   storage:
     wiredTiger:
       engineConfig:
         cacheSizeGB: 1
   ```

## Security Best Practices

1. **Regular Updates**
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

2. **Firewall Configuration**
   ```bash
   sudo ufw status
   sudo ufw allow from your-ip to any port 22
   ```

3. **SSH Security**
   ```bash
   # Edit SSH configuration
   sudo nano /etc/ssh/sshd_config
   ```
   Set these options:
   ```
   PermitRootLogin no
   PasswordAuthentication no
   ```

4. **Regular Security Audits**
   ```bash
   # Install security tools
   sudo apt install -y fail2ban lynis
   
   # Run security audit
   sudo lynis audit system
   ```

## Maintenance Schedule

### Daily Tasks
- Check application logs
- Monitor system resources
- Verify backup completion

### Weekly Tasks
- Update system packages
- Review security logs
- Clean up old logs

### Monthly Tasks
- Full system backup
- Security audit
- Performance review

## Emergency Procedures

### Server Down
1. Check system status
2. Review logs
3. Restart services
4. Contact support if needed

### Data Loss
1. Stop application
2. Restore from backup
3. Verify data integrity
4. Restart services

### Security Breach
1. Isolate server
2. Change all passwords
3. Review logs
4. Restore from clean backup
5. Update security measures 