#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
LAMBDAS_SRC_DIR="$ROOT_DIR/lambdas"
LAYERS_SRC_DIR="$ROOT_DIR/layers"

echo "Cleaning up build directory: $BUILD_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# 1. Package Shared Layers
echo "Packaging Layer: common"
LAYER_DEST="$BUILD_DIR/layers/common/python"
mkdir -p "$LAYER_DEST"
cp -r "$LAYERS_SRC_DIR/common/"* "$LAYER_DEST/"

LAYER_REQS="$LAYERS_SRC_DIR/common/requirements.txt"
if [ -f "$LAYER_REQS" ]; then
    REQ_CONTENT=$(grep -v '^#' "$LAYER_REQS" || true)
    if [ -n "$REQ_CONTENT" ]; then
        echo "Installing dependencies for layer: common"
        python3 -m pip install -r "$LAYER_REQS" -t "$LAYER_DEST" --only-binary=:all: --platform manylinux2014_x86_64 --implementation cp --python-version 312 --upgrade
    fi
fi

# 2. Package Lambda Functions
for dir in "$LAMBDAS_SRC_DIR"/*; do
    if [ -d "$dir" ]; then
        name=$(basename "$dir")
        echo "Packaging Lambda Function: $name"
        DEST="$BUILD_DIR/lambdas/$name"
        mkdir -p "$DEST"
        cp -r "$dir/"* "$DEST/"

        REQ_FILE="$dir/requirements.txt"
        if [ -f "$REQ_FILE" ]; then
            REQ_CONTENT=$(grep -v -E '^\s*#|^\s*$' "$REQ_FILE" || true)
            if [ -n "$REQ_CONTENT" ]; then
                echo "Installing dependencies for Lambda: $name"
                python3 -m pip install -r "$REQ_FILE" -t "$DEST" --only-binary=:all: --platform manylinux2014_x86_64 --implementation cp --python-version 312 --upgrade
            fi
        fi
    fi
done

echo "Lambdas and Layers build completed successfully!"
