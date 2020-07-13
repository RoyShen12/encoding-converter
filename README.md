# encoding-converter

# 前提条件

- node.js 版本 >= 8.0

# --help

```
Usage
  $ node index -d <> [options]

Options
  -d, --dir <str>               Working directory
  -e, --extension <str>         Working extension, default is txt
  -i, --ignore <str | reg>      Ignore pattern, default is ^\\.,^node_modules$
```

# 安装

```shell
git clone https://github.com/RoyShen12/encoding-converter.git && cd encoding-converter
npm install
```

# 如何使用

```
# 参数是你想要处理的目录
# 可以使用相对目录，也可以使用绝对路径
# 程序会递归寻找所有的 txt 文件，转换到 utf-8 并删除 BOM 标记
node index -d ~/text-books/example-dir # posix
node index -d "C:\Users\Admin\Downloads\Books" # windows

# -i <string | regexp>
# 注意：此处仅支持有限的正则：
# 不支持忽略大小写，如果想达到忽略大小写的效果，可以将 /akg/i 改写为 /[aA][kK][gG]/
# 不支持 \d, \w, \d 等反斜杠标记
node index -d ~/text-books/example-dir -i no-change,^important* # 处理文件，但忽略扫描到的文件名或目录名中包含 no-change 或以 important 开头的情况

# -e <string>
node index -d ~/text-books/example-dir -e js # 除了默认的 txt 后缀文件外，也会处理 js 文件

```
