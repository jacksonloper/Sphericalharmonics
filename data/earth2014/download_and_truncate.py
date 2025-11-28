#!/usr/bin/env python3
"""
Download and truncate Earth2014 BSHC gravity model file.

This script downloads the Earth2014.BED2014.degree2160.bshc file from Curtin University's
DDFE server and truncates it to a specified maximum degree to reduce file size.

Usage:
    python download_and_truncate.py [--max-degree 1143] [--output-dir .]
"""

import struct
import urllib.request
import argparse
import os
from pathlib import Path

# Source URL for the full Earth2014 BED2014 BSHC file
SOURCE_URL = "https://ddfe.curtin.edu.au/gravitymodels/Earth2014/data_5min/shcs_to2160/Earth2014.BED2014.degree2160.bshc"
ORIGINAL_MAX_DEGREE = 2160
DEFAULT_TRUNCATED_DEGREE = 1143  # Results in ~9.99 MB file


def download_file(url: str, output_path: str) -> None:
    """Download a file from a URL."""
    print(f"Downloading from {url}...")
    urllib.request.urlretrieve(url, output_path)
    print(f"Downloaded to {output_path}")


def count_coefficients(max_degree: int) -> int:
    """Count total number of coefficient pairs up to a given degree."""
    # For each degree l from 0 to max_degree, there are (l+1) orders (m from 0 to l)
    return sum(l + 1 for l in range(max_degree + 1))


def truncate_bshc(input_path: str, output_path: str, max_degree: int) -> None:
    """
    Truncate a BSHC file to a maximum degree.
    
    BSHC format stores coefficients as:
    - For each degree l from 0 to max_degree:
      - For each order m from 0 to l:
        - Clm (double, 8 bytes)
        - Slm (double, 8 bytes)
    """
    # Calculate number of bytes to keep
    num_coeffs = count_coefficients(max_degree)
    bytes_to_keep = num_coeffs * 16  # 16 bytes per coefficient pair (Clm, Slm as doubles)
    
    print(f"Truncating to degree {max_degree}")
    print(f"Keeping {num_coeffs:,} coefficient pairs ({bytes_to_keep:,} bytes = {bytes_to_keep/(1024*1024):.2f} MB)")
    
    with open(input_path, 'rb') as f_in:
        data = f_in.read(bytes_to_keep)
    
    with open(output_path, 'wb') as f_out:
        f_out.write(data)
    
    actual_size = os.path.getsize(output_path)
    print(f"Output file size: {actual_size:,} bytes ({actual_size/(1024*1024):.2f} MB)")


def main():
    parser = argparse.ArgumentParser(description="Download and truncate Earth2014 BSHC file")
    parser.add_argument("--max-degree", type=int, default=DEFAULT_TRUNCATED_DEGREE,
                       help=f"Maximum degree to keep (default: {DEFAULT_TRUNCATED_DEGREE})")
    parser.add_argument("--output-dir", type=str, default=".",
                       help="Output directory for the truncated file")
    parser.add_argument("--keep-original", action="store_true",
                       help="Keep the original downloaded file")
    args = parser.parse_args()
    
    # Validate max degree
    if args.max_degree > ORIGINAL_MAX_DEGREE:
        print(f"Warning: Requested degree {args.max_degree} exceeds original max degree {ORIGINAL_MAX_DEGREE}")
        args.max_degree = ORIGINAL_MAX_DEGREE
    
    # Create output directory if needed
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # File paths
    original_file = output_dir / f"Earth2014.BED2014.degree{ORIGINAL_MAX_DEGREE}.bshc"
    truncated_file = output_dir / f"Earth2014.BED2014.degree{args.max_degree}.bshc"
    
    # Download original file
    download_file(SOURCE_URL, str(original_file))
    
    # Truncate
    if args.max_degree < ORIGINAL_MAX_DEGREE:
        truncate_bshc(str(original_file), str(truncated_file), args.max_degree)
        
        # Remove original unless --keep-original
        if not args.keep_original:
            os.remove(original_file)
            print(f"Removed original file: {original_file}")
    else:
        print(f"No truncation needed (max_degree = {args.max_degree})")
        truncated_file = original_file
    
    print(f"\nDone! Truncated file: {truncated_file}")
    
    # Show expected size vs actual
    expected_coeffs = count_coefficients(args.max_degree)
    expected_size = expected_coeffs * 16
    actual_size = os.path.getsize(truncated_file)
    
    if actual_size != expected_size:
        print(f"\nWarning: File size mismatch!")
        print(f"  Expected: {expected_size:,} bytes")
        print(f"  Actual:   {actual_size:,} bytes")
        print("The BSHC format may include additional header data.")


if __name__ == "__main__":
    main()
