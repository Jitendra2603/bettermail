/**
 * Build optimization script for Next.js
 * 
 * This script helps optimize the Next.js build process by:
 * 1. Cleaning up unnecessary files before build
 * 2. Setting up proper caching
 * 3. Optimizing memory usage
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const config = {
  // Directories to clean before build
  cleanDirs: [
    '.next/cache/images', // Clean image cache but keep other caches
    'node_modules/.cache/turbo', // Clean turbo cache
  ],
  // Environment variables to set for build
  envVars: {
    NODE_OPTIONS: '--max-old-space-size=4096', // Increase memory limit
    NEXT_TELEMETRY_DISABLED: '1', // Disable telemetry
    NEXT_CACHE_DIR: '.next/cache', // Set cache directory
  },
};

// Clean directories
console.log('🧹 Cleaning up unnecessary files...');
config.cleanDirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (fs.existsSync(dirPath)) {
    try {
      console.log(`  - Cleaning ${dir}`);
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (error) {
      console.error(`  ❌ Failed to clean ${dir}:`, error.message);
    }
  }
});

// Create .dockerignore if it doesn't exist
const dockerignorePath = path.join(__dirname, '.dockerignore');
if (!fs.existsSync(dockerignorePath)) {
  console.log('📝 Creating .dockerignore file...');
  const dockerignoreContent = `
# Dependencies
node_modules
npm-debug.log
yarn-debug.log
yarn-error.log

# Next.js build output
.next
out

# Testing
coverage
.nyc_output

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Misc
.DS_Store
.idea
.vscode
*.pem
.git
.github
README.md
LICENSE
*.log

# Firebase
.firebase
firebase-debug.log
firestore-debug.log
ui-debug.log

# Build cache
.cache
.swc

# Temporary files
tmp
temp
*.tmp
*.temp
`;
  fs.writeFileSync(dockerignorePath, dockerignoreContent.trim());
}

// Set environment variables
console.log('🔧 Setting up environment variables for build optimization...');
Object.entries(config.envVars).forEach(([key, value]) => {
  process.env[key] = value;
  console.log(`  - ${key}=${value}`);
});

// Print optimization summary
console.log('\n✅ Build optimization complete!');
console.log('Run your build command now for faster builds.');
console.log('Recommended: npm run build:fast');

// Execute build if requested
if (process.argv.includes('--build')) {
  console.log('\n🚀 Starting optimized build...');
  try {
    // Use build:fast to avoid infinite recursion
    execSync('npm run build:fast', { stdio: 'inherit' });
    console.log('✅ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
} 