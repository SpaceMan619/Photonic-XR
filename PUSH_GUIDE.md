# Photonic XR: Deployment Guide

Good news! Your project is ready to go. Follow these step-by-step instructions to push your code to GitHub and deploy it.

## 1. Prepare the Project
Open your terminal in VS Code (ensure you are in the `photonicXR` folder) and run:

```bash
# 1. Clean up old git history (optional, starts fresh)
rm -rf .git 

# 2. Initialize new git repository
git init

# 3. Create a .gitignore file (to stop junk files from uploading)
echo "node_modules\n.DS_Store\ndist\n.env" > .gitignore
```

## 2. Push to GitHub
1.  Go to [GitHub.com/new](https://github.com/new).
2.  Repository name: `photonic-xr`.
3.  **Do not** check "Initialize with README" (keep it empty).
4.  Click **Create repository**.

5.  **Copy and run these commands** in your VS Code terminal:

```bash
git add .
git commit -m "Initial commit of Photonic XR"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/photonic-xr.git
git push -u origin main
```
*(Replace `YOUR_GITHUB_USERNAME` with your actual username)*

## 3. Deploy to Vercel (Easiest Way)
1.  Go to [vercel.com/new](https://vercel.com/new).
2.  Click **Import** next to `photonic-xr`.
3.  **Framework Preset**: It should say "Vite".
4.  Click **Deploy**.

## 4. Test on Headset
Once deployed, Vercel gives you a URL (e.g., `photonic-xr.vercel.app`).
1.  Put on your Meta Quest.
2.  Open the Browser.
3.  Go to that URL.
4.  Click "Enter VR" (if your app supports it).

---
**Need Help?**
If you get an error like "remote origin already exists", run `git remote remove origin` and try again.
