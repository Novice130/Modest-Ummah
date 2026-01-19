#!/bin/bash
set -e

echo "============================================"
echo "   Modest Ummah VM Setup & Deployment"
echo "============================================"

# 1. Install Docker & Dependencies
echo "[1/4] Checking/Installing Docker..."
if ! command -v docker &> /dev/null; then
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y apt-transport-https ca-certificates curl software-properties-common git
    
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
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
