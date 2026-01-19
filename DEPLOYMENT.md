# Modest Ummah Deployment Guide (Google Cloud Platform)

This guide covers deploying Modest Ummah to a Google Cloud Compute Engine VM using Docker.

## Prerequisites

- **Google Cloud VM**: Ubuntu 22.04 LTS (Recommended: e2-medium or better for build performance).
- **Domain**: `modestummah.com` pointing to your VM's External IP.
- **SSH Access**: You should be able to terminal into your VM.

## Quick Start (Automated Script)

If you don't want to run commands manually, you can create a setup script on your VM:

1.  SSH into your VM.
2.  Create the file: `nano setup.sh`
3.  Paste the contents of `vm-setup.sh` (found in this repo).
4.  Make it executable: `chmod +x setup.sh`
5.  Run it: `./setup.sh`

---

## Manual Installation Steps

## Step 1: Install Docker on VM

Run these commands on your VM to install Docker and Docker Compose:

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install prerequisites
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verify installation
sudo docker --version
sudo docker compose version
```

## Step 2: Clone & Configure

```bash
# Clone the repository
git clone https://github.com/Novice130/Modest-Ummah.git
cd modest-ummah

# Setup Environment Variables
cp .env.example .env
nano .env
```

**Critical `.env` values to check:**
```env
NEXT_PUBLIC_APP_URL=https://modestummah.com
NEXT_PUBLIC_POCKETBASE_URL=https://modestummah.com/api
# Add your Stripe & Shipping keys here
```

## Step 3: Start Services

```bash
# Build and start containers in the background
sudo docker compose up -d --build
```

Access your site:
- **Store**: `https://modestummah.com`
- **Admin**: `https://modestummah.com/_/`
- **API**: `https://modestummah.com/api/`

## Step 4: Making Changes (Two Methods)

### Method A: Connect Directly (VS Code Remote SSH)
**Best for:** Quick edits, debugging, or acting as your "cloud development environment".

1.  **Install Extension**: Install "Remote - SSH" in VS Code.
2.  **Connect**: Click the green icon in the bottom-left corner > "Connect to Host..." > `username@your-vm-ip`.
3.  **Open Folder**: Once connected, open `/home/username/modest-ummah`.
4.  **Edit**: You can now edit files directly on the server string.
5.  **Apply Changes**:
    *   If you edit code: You typically need to rebuild the container for Next.js to pick it up in production mode:
        ```bash
        sudo docker compose up -d --build
        ```
    *   *Pro Tip*: For a dev-like experience on the server, you can stop the production container and run `npm run dev` directly if you install Node.js on the VM, OR create a `docker-compose.dev.yml` that mounts volumes.

### Method B: Git Workflow (Recommended for Stability)
**Best for:** Safety, team work, and keeping a history of changes.

1.  **Local**: Make changes on your laptop.
2.  **Push**: `git push origin main`
3.  **VM**: Run this update command:
    ```bash
    git pull
    sudo docker compose up -d --build
    ```

## Troubleshooting

- **Check Logs**: `sudo docker compose logs -f modest-ummah-app`
- **Restart All**: `sudo docker compose restart`
- **Stop All**: `sudo docker compose down`

## SSL Configuration
Nginx is currently configured on port 80. For HTTPS:
1.  Install Certbot: `sudo apt install certbot -y`
2.  Generate certs: `sudo certbot certonly --standalone -d modestummah.com -d www.modestummah.com`
3.  Uncomment the SSL sections in `nginx/nginx.conf`.
4.  Restart Nginx: `sudo docker compose restart modest-ummah-nginx`

---

## verification

To confirm your deployment is working correctly on the VM:

1.  **Check Running Containers**:
    ```bash
    sudo docker compose ps
    ```
    *You should see 3 containers (`modest-ummah-app`, `modest-ummah-pocketbase`, `modest-ummah-nginx`) with "Up" status.*

2.  **View Logs**:
    ```bash
    sudo docker compose logs -f modest-ummah-app
    ```
    *Look for "Ready in XXXms" and no error messages.*

3.  **Local Curl Test**:
    From inside the VM, check if the app is responding locally:
    ```bash
    curl http://localhost:3000
    ```
    *You should see HTML output starting with `<!DOCTYPE html>`.*

4.  **Public Access**:
    Visit `https://modestummah.com` in your browser.
    *   Verify the title says "Modest Ummah".
    *   Check that images load correctly.
    *   Test the "Login" page.
