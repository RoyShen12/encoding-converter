# encoding-converter

# 前提条件

- node.js 版本 >= 8.0

# 如何使用

```shell
git clone https://github.com/RoyShen12/encoding-converter.git && cd encoding-converter
npm install
# 参数是你想要处理的目录
# 可以使用相对目录，也可以使用绝对路径
# 程序会递归寻找所有的 txt 文件，转换到 utf-8 并删除 BOM 标记
node index ~/text-books/example-dir # posix
node index C:\Users\Admin\Downloads\Books # windows
```
