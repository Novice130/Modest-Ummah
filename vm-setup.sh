#!/bin/bash
set -e

echo "============================================"
echo "   Modest Ummah VM Setup & Deployment"
echo "============================================"

# 1. Install Docker & Dependencies
echo "[1/4] Checking/Installing Docker..."
if ! command -v docker &> /dev/null; then
    echo "Installing Docker using official convenience script..."
    
    # Wait for any existing apt process to finish
    while sudo fuser /var/lib/apt/lists/lock >/dev/null 2>&1 || sudo fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
        echo "Waiting for other apt process to finish..."
        sleep 5
    done
    
    # Clean up any bad previous attempts
    if [ -f /etc/apt/sources.list.d/docker.list ]; then
        echo "Removing potential bad docker.list..."
        sudo rm /etc/apt/sources.list.d/docker.list
    fi

    echo "Installing Docker using official convenience script..."

    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
else
    echo "Docker is already installed."
fi

# 2. Clone Repository
echo "[2/4] Setting up Repository..."
REPO_DIR="Modest-Ummah"
REPO_URL="https://github.com/Novice130/Modest-Ummah.git"

if [ -d "$REPO_DIR" ]; then
    echo "Directory $REPO_DIR already exists. Pulling latest changes..."
    cd $REPO_DIR
    git pull
else
    git clone $REPO_URL
    cd $REPO_DIR
fi

# 3. Setup Environment
echo "[3/4] Configuring Environment..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env file. >>> PLEASE EDIT .env WITH YOUR REAL KEYS <<<"
else
    echo ".env file exists. Skipping."
fi

# 4. Start Services
echo "[4/4] Starting Services..."
sudo docker compose up -d --build

echo "============================================"
echo "   Deployment Complete!"
echo "   App: https://modestummah.com"
echo "   Admin: https://modestummah.com/_/"
echo "============================================"
echo "IMPORTANT: Don't forget to 'nano .env' to update your secrets!"
