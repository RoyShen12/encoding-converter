# encoding-converter

# Requirements

- node.js >= 8.0

# --help

```
Usage
  $ node index -d <> [options]

Options
  -d, --dir <str>               Working directory
  -e, --extension <str>         Working extension, default is txt
  -i, --ignore <str | reg>      Ignore pattern, default is ^\\.,^node_modules$
```

# Installation

```shell
git clone https://github.com/RoyShen12/encoding-converter.git && cd encoding-converter
npm install
```

# How to Use

```
# The argument is the directory you want to process
# You can use a relative directory or an absolute path
# The program will recursively find all txt files, convert them to utf-8 and remove BOM markers
node index -d ~/text-books/example-dir # posix
node index -d "C:\Users\Admin\Downloads\Books" # windows

# -i <string | regexp>
# Note: only limited regular expressions are supported here:
# Case insensitive is not supported, to achieve the effect of case insensitivity, /akg/i can be rewritten as /[aA][kK][gG]/
# \d, \w, \d and other backslash markers are not supported.
node index -d ~/text-books/example-dir -i no-change,^important* # process files, but ignore scans that contain no-change or start with important in the file or directory name

# -e <string>
node index -d ~/text-books/example-dir -e js # In addition to the default txt suffix files, js files will also be processed

```
