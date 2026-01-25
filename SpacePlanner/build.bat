@echo off
npx esbuild js/app.js --bundle --outfile=bundle.js --format=iife
echo Build complete: bundle.js
