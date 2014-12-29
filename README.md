FEKIT
=====================

### fekit extension是什么? ###

有时你希望增加一些命令给 fekit，但是大多数情况下并不想把它加入 fekit project 官方命令中。 

所以，fekit extension为你提供了这样一种办法来扩展命令。

## 如何开发？ ###

请先将本项目 clone 到本地(假设要开发一个svn扩展)

    git clone git@github.com:rinh/fekit-extension-template.git ./fekit-extension-svn

本项目是 extension标准模板，以下文件是你需要修改的。

* index.js  --- 扩展入口文件，主要功能需要写在这里
* package.json  --- npm 配置文件
* README.md  --- 说明文档，简单介绍一下你的功能

#### package.json  ####

    {
        // *必填项* 扩展命令名称
        "fekit_extension_command_name":"",
        // *必填项* 例 fekit-extension-svn
        "name": "fekit-extension-template",
        // *必填项* 请维护你的依赖
        "version": "0.0.0"
    }

## 如何发布? ###

    npm publish 

## 如何使用? ###

以 svn 为例

package.json

    {
        // *必填项* 扩展命令名称
        "fekit_extension_command_name":"svn",
        // *必填项* 例 fekit-extension-svn
        "name": "fekit-extension-svn",
        // *必填项* 请维护你的依赖
        "version": "0.1.0"
    }

命令行

    npm install fekit-extension-svn -g

    fekit svn --help


### 安装时的一些问题 ###

如果出现

    sh: node: Permission denied

这样的提示，请使用

    npm config set user 0
    npm config set unsafe-perm true



