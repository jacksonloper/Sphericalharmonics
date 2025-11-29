#!/usr/bin/env python3
"""
Generate multiple adaptive mesh bundles at different quality levels
"""

import subprocess
import os


# Define mesh bundle configurations
BUNDLES = {
    'low': {
        'max_vertices': 25000,
        'error_threshold': 50.0,
        'description': 'Low quality - fast loading, mobile devices'
    },
    'medium': {
        'max_vertices': 50000,
        'error_threshold': 25.0,
        'description': 'Medium quality - balanced performance'
    },
    'high': {
        'max_vertices': 100000,
        'error_threshold': 15.0,
        'description': 'High quality - detailed visualization'
    },
    'ultra': {
        'max_vertices': 200000,
        'error_threshold': 8.0,
        'description': 'Ultra quality - maximum detail'
    }
}


def generate_bundle(name, config):
    """Generate a single mesh bundle."""
    output_file = f'public/earthtoposources/sur_adaptive_{name}.mesh'

    print(f"\n{'='*70}")
    print(f"Generating {name.upper()} quality bundle")
    print(f"Description: {config['description']}")
    print(f"Max vertices: {config['max_vertices']:,}")
    print(f"Error threshold: {config['error_threshold']}m")
    print(f"{'='*70}\n")

    cmd = [
        'python3', 'generate_adaptive_mesh.py',
        '--max-vertices', str(config['max_vertices']),
        '--error-threshold', str(config['error_threshold']),
        '--output', output_file
    ]

    result = subprocess.run(cmd)

    if result.returncode != 0:
        print(f"❌ Failed to generate {name} bundle")
        return False

    # Get file size
    if os.path.exists(output_file):
        size_mb = os.path.getsize(output_file) / 1024 / 1024
        print(f"✓ Generated {output_file} ({size_mb:.2f} MB)")

    return True


def main():
    print("="*70)
    print("ADAPTIVE MESH BUNDLE GENERATOR")
    print("="*70)
    print(f"\nGenerating {len(BUNDLES)} mesh bundles:\n")

    for name, config in BUNDLES.items():
        print(f"  {name:8s} - {config['description']}")

    print("\n")

    # Generate all bundles
    success_count = 0
    for name, config in BUNDLES.items():
        if generate_bundle(name, config):
            success_count += 1

    print("\n" + "="*70)
    print(f"Bundle generation complete: {success_count}/{len(BUNDLES)} successful")
    print("="*70)

    # Generate bundle manifest
    print("\nGenerating bundle manifest...")

    manifest = {
        'bundles': {},
        'format_version': 1
    }

    for name, config in BUNDLES.items():
        output_file = f'public/earthtoposources/sur_adaptive_{name}.mesh'
        if os.path.exists(output_file):
            size_bytes = os.path.getsize(output_file)
            manifest['bundles'][name] = {
                'file': f'earthtoposources/sur_adaptive_{name}.mesh',
                'description': config['description'],
                'max_vertices': config['max_vertices'],
                'error_threshold': config['error_threshold'],
                'size_bytes': size_bytes,
                'size_mb': round(size_bytes / 1024 / 1024, 2)
            }

    # Write manifest as JSON
    import json
    manifest_file = 'public/earthtoposources/mesh_bundles.json'
    with open(manifest_file, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"✓ Wrote manifest to {manifest_file}")

    # Print summary table
    print("\n" + "="*70)
    print("BUNDLE SUMMARY")
    print("="*70)
    print(f"{'Quality':<10} {'Vertices':<12} {'Error':<12} {'Size':<10}")
    print("-"*70)

    for name, info in manifest['bundles'].items():
        print(f"{name:<10} {info['max_vertices']:<12,} {info['error_threshold']:<12}m {info['size_mb']:<10.2f} MB")

    print("="*70)


if __name__ == '__main__':
    main()
