import re
import os
import glob

# Read CSS classes
with open('src/styles/home.css', 'r') as f:
    css = f.read()

# Naive CSS class extractor
# Matches classes like .hero, .page-shell, but ignores pseudo-classes or values
classes = set()
for match in re.finditer(r'\.([a-zA-Z0-9_-]+)', css):
    classes.add(match.group(1))

# Read all TSX files
tsx_files = glob.glob('src/**/*.tsx', recursive=True)
tsx_content = ""
for f in tsx_files:
    with open(f, 'r') as file:
        tsx_content += file.read()

unused_classes = []
for cls in classes:
    # Special cases handling
    if cls in ['active', 'is-hidden', 'expanded', 'has-active', 'is-loaded', 'is-pushed-back', 'is-active', 'is-open', 'swiping-out', 'images-1', 'images-2', 'images-3', 'images-4', 'images-9']:
        continue # dynamic classes
    
    if cls not in tsx_content:
        unused_classes.append(cls)

print("Potentially unused classes in home.css:")
for c in sorted(unused_classes):
    print(c)
