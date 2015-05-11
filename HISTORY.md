# 历史记录

---

## 0.1.1
删除对qapp命令支持，使用add命令添加adapter和demo而不是install
fekit kami -a adapter-qapp
fekit kami -a demo


## 0.1.2

`fixed` [#2](http://gitlab.corp.qunar.com/kami/kamibuilder/issues/2)日历组件，交互近似于原生的ios日历

## 0.1.3
BUG修复：版本号0.0.9大于0.0.10的问题

## 0.1.4
格式化info.config后再输出

## 0.2.0
* 增加publish命令（publish widget1/widget2），可以直接推送资源包到服务器，删除了pack和packall命令
* 增加--force || -f 命令，如果version与服务器版本一致需要强行覆盖，需要使用该命令

## 0.2.1
* 修复adapter安装后路径错误的问题
