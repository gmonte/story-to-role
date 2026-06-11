#!/bin/bash

# clean up
rm -rf .husky/_/*
rm -rf .nx
rm -rf apps/*/.next
rm -rf apps/*/dist
rm -rf apps/*/node_modules
rm -rf configs/*/node_modules
rm -rf packages/*/node_modules
rm -rf node_modules

# install node
nvm install

# install pnpm
corepack prepare pnpm@10.33.0 --activate
corepack enable
pnpm setup

# install dependencies
pnpm install
