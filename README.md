KamiBuilder
=============================
依赖于fekit，当前版本已支持组件的多版本管理

## 安装
执行npm install fekit-extension-kami

## 使用流程
1. 在需要使用kami组件的目录下执行fekit kami --init命令 
2. 修改创建的kami.config文件，scripts项用来配置需要安装的组件，demo项用来配置需要下载的demo文件(还未开发该功能)，adapter项用来配置需要加载的相应适配器，目前规划的有qapp/avalon/zepto等
3. 执行fekit kami --install命令，将在该目录的src/kami下安装所有配置的组件
4. qapp使用的话，执行fekit kami -q，将在该目录的src/modules/scripts下创建kami组件
5. 可以单独使用fekit kami -a dialog命令安装单独的组件，其他操作命令见下面介绍。
6. 使用--path可以自定义安装路径

## 多版本管理方式
* 安装了kami组件后，会创建src/kami/xx组件/index.js文件，用户可以直接require该文件来调用xx组件。
* 如果该目录下安装了多个版本，需要使用特定版本的组件时，也可以引用src/kami/xx组件/具体版本/index.js文件。
* 当执行了fekit kami -u xx组件 命令后，会自动更新 src/kami/xx组件/index.js ，将引用的版本指向update后的版本。
* 使用fekit kami -a xx组件，除非第一次add，否则不会自动更新 src/kami/xx组件/index.js

## 命令介绍
安装完KamiBuilder后可以执行fekit kami --help查看命令使用帮助

### --list || -l 
说明：查看kami所提供的组件列表。

例如：fekit kami -l

### --local
说明：查看本地安装的kami组件列表。默认搜索当前目录下的。

例如：fekit kami --local   fekit kami --local /Users/guest/kami/'

### --init
说明：kami组件初始化，将在当前目录下创建kami.config文件

例如：fekit kami --init

### --install || -i
说明：加载当前目录kami.config的scripts节点配置的组件

例如：fekit kami -i

### --add || -a [widget@version]
说明：添加kami组件。不会自动更新index.js文件

参数：widget必须指定，如果没有指定version，则默认加载最新版本

例如：fekit kami -a dialog@0.0.1      fekit kami -a adapter-qapp@0.0.1

### --update || -u [widget@version]
说明：更新kami组件，会自动更新index.js文件。如果该组件存在**多个版本**，则执行update命令后不会自动删除旧的版本，需要配合del命令删除旧版本。

参数：widget必须指定，如果没有指定version，则默认加载最新版本

例如：fekit kami -u dialog

### --del || -d [widget@version]
说明：删除kami组件。

参数：widget必须指定，如果指定版本号，则删除指定的版本，否则将删除**整个组件**

例如：fekit kami -d dialog@0.0.1

### --info[widget]
说明：查看指定组件的详细信息，包括名称、最新版本号、组件简介、最后更新时间、源码路径等

参数：widget必须指定。

例如：fekit kami --info dialog

### --pack || -p[widget]
说明：组件打包，仅供组件开发者使用！默认打包到当前目录下的kami-source文件夹。必须保证组件当前配置的version(kami.config中的version)大于kami-source/info.config中配置的版本，否则**打包失败**。打包成功后会自动更新kami-source中的版本号和最后更新时间数据。

参数：widget必须指定。

例如：fekit kami -p dialog

### --packall
说明：全部组件打包，仅供组件开发者使用！默认打包到当前目录下的kami-source文件夹。必须保证组件当前配置的version(kami.config中的version)大于kami-source/info.config中配置的版本，否则打包失败。打包成功后会自动更新kami-source中的版本号和最后更新时间数据。

例如：fekit kami --packall    fekit kami --packall --path /Users/guest/kami-source

### --version || -v
说明：查看kami构建工具版本号。

例如：fekit kami -v

### --path
说明：自定义路径，支持绝对路径和相对路径。对init/install/add/update/del/pack/packall等命令都有效。

例如：fekit kami --init --path '/Users/guest/kami'    fekit kami --init --path '../guest/kami'


## TODO
1）提供单独的kami命令工具，不依赖于fekit，需要考虑如何解决require问题