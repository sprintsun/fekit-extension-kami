var fs = require('fs'),
    path = require('path'),
    request = require('request'),
    async = require('async'),
    colors = require('colors'),
    targz = require('tar.gz'),
    fsUtil = require('./fs-util');

var BASE_URL = 'http://ued.qunar.com/kami-source/';
var VERSION = '0.0.1';
var kamiSource = 'src/kami';
var kamiInfo = null;

var log = console.log;
var success = function(msg) {
    log(msg.green);
};
var error = function(msg) {
    log(msg.red);
};
var warn = function(msg) {
    log(msg.yellow);
}

// 满足commonJS的版本规范定义
function checkVersion(version) {
    return /^\d+\.\d+\.\d+$/.test(version);
}

function showList() {
    return function(cb) {
        var widgets;
        if (widgets = kamiInfo.widgets) {
            log('kami组件列表信息：');
            log('------------------------------------');
            for(var name in widgets) {
                log(name + '\t\t' + widgets[name].version + '\t\t' + widgets[name].description);
            }
        }
        cb(null);
    };
}

function showInfo(type) {
    return function(cb) {
        var widgets = kamiInfo.widgets;
        if (widgets && widgets[type]) {
            log('------------------------------------');
            log('组件名：' + type);
            log('版本：' + widgets[type].version);
            log('描述：' + (widgets[type].description || '无'));
            log('更新时间：' + (widgets[type].update_time || '无'));
        } else {
            warn('kami组件库不存在：' + type);
        }
        cb(null);
    };
}

// 从服务器获取组件最新版本号
function getKamiInfo(cb) {
    var url = BASE_URL + 'info.config';
    request(url, function(err, res, body) {
        if (!err && res.statusCode === 200) {
            try {
                kamiInfo = JSON.parse(body);
            } catch (e) {
                error('info.config解析失败。');
                return;
            }
            cb(null);
        } else {
            error('从 '+url+' 下载info.config失败！');
        }
    });
}

function installKami(taskList, widgets, root) {
    var kamiPath = path.join(root, kamiSource);
    fsUtil.rmDirSync(kamiPath);
    fsUtil.mkDirSync(kamiPath);
    widgets.forEach(function(widget) {
        taskList.push(addKami(widget.name, widget.version, root));
    });
}

// 添加单个组件
function addWidget(type, version, root, cb) {

    if(!checkVersion(version)) {
        cb('版本号 ' + version + ' 有误，请遵循semver语义化版本规则！');
        return;
    }

    var getLocalPath = function() {
        return path.join(root, kamiSource, type);
    };

    // 判断本地是否已存在该版本
    var widget = type + '@' + version;
    var localPath = getLocalPath();
    var widgetPath = path.join(localPath, version);
    if(fs.existsSync(widgetPath)) {
        cb(widget + '已存在。', true);
        return;
    }

    // 创建目录
    fsUtil.mkDirSync(localPath);
    // 下载
    var url = BASE_URL + type + '/' + widget + '.map';
    request({
        url: url,
        encoding: null
    }, function (err, res, body) {
        if (!err && res.statusCode === 200) {
            // 写入临时文件夹创建
            var tmpPath = path.join(root, './tmp/' + widget + '.tar.gz');
            fs.writeFileSync(tmpPath, body);

            // 解压
            new targz().extract(
                tmpPath,
                widgetPath,
                function (err) {
                    if (err) {
                        cb('解压 ' + tmpPath + ' 失败！');
                    } else {
                        moveToUpperDirectory(path.join(widgetPath, type));
                        cb(null, false, widgetPath, widget);
                    }
                }
            );
        } else {
            cb('下载 ' + url + ' 失败！');
        }
    });
}

// 获取组件依赖
function getDependence(widgetRoot) {
    try{
        var widgetConfig = JSON.parse(fs.readFileSync(path.join(widgetRoot, 'kami.config')));
        return widgetConfig['dependance'];
    } catch(e) {
        error('读取组件配置文件失败！');
        return null;
    }
}

// 添加完整的kami组件
function addKami(type, version, root) {
    var total = 0,
        count = 0;
    return function(cb) {

        if(!kamiInfo) {
            error('加载不到kami.config。');
            cb(null);
            return;
        }
        if(!kamiInfo['widgets'] || !kamiInfo['widgets'][type]) {
            error(type + ' 组件不存在。');
            cb(null);
            return;
        }

        version == "*" && (version = kamiInfo.widgets[type].version);
        var widget = type + '@' + version;
        log('开始安装 ' + widget + ' ...');
        total++;

        var callback = function(errMsg, exists, widgetPath, currWidget) {
            if(exists) {
                if(count === 0) {
                    warn(errMsg);
                    cb(null);
                } else {
                    count++;
                }
            } else if(errMsg) {
                error(errMsg);
                error('安装 ' + widget + ' 失败！');
                cb(null);
            } else {
                count++;
                if(count != 1) {
                    log('安装依赖 ' + currWidget + ' 成功 ...');
                }
                var widgets = getDependence(widgetPath);
                for(var name in widgets) {
                    total++;
                    addWidget(name, widgets[name], root, callback);
                }
                if(count == total) {
                    updateWidgetIndex(version, path.join(root, kamiSource, type), false);
                    success('安装 ' + widget + ' 成功 ...');
                    total = count = 0;
                    cb(null);
                }
            }
        };

        addWidget(type, version, root, callback);
    }
}

// 更新kami组件
function updaeKami(type, version, root) {
    var total = 0,
        count = 0;
    return function(cb) {

        if(!kamiInfo) {
            error('加载不到kami.config。');
            cb(null);
            return;
        }
        if(!kamiInfo['widgets'] || !kamiInfo['widgets'][type]) {
            error(type + ' 组件不存在。');
            cb(null);
            return;
        }

        version == "*" && (version = kamiInfo.widgets[type].version);
        var widget = type + '@' + version;
        log('开始安装 ' + widget + ' ...');
        total++;

        var callback = function(errMsg, exists, widgetRoot, currWidget) {
            if(exists) {
                if(count === 0) {
                    warn(errMsg);
                    cb(null);
                } else {
                    count++;
                }
            } else if(errMsg) {
                error(errMsg);
                error('安装 ' + widget + ' 失败！');
                cb(null);
            } else {
                count++;
                if(count != 1) {
                    log('安装依赖 ' + currWidget + ' 成功 ...');
                }
                var widgets = getDependence(widgetRoot);
                for(var name in widgets) {
                    total++;
                    addWidget(name, widgets[name], root, callback);
                }
                if(count == total) {
                    updateWidgetIndex(version, path.join(root, kamiSource, type), true);
                    success('安装 ' + widget + ' 成功 ...');
                    total = count = 0;
                    deleteOldVersion(type, version, root, function() {
                        cb(null);
                    });
                }
            }
        };

        addWidget(type, version, root, callback);
    }
}

// 删除旧版本
function deleteOldVersion(type, version, root, cb) {
    var widgetPath = path.join(root, kamiSource, type);
    var delCount = 0;
    fs.readdirSync(widgetPath).forEach(function(file) {
        var tmpPath = path.join(widgetPath, file);
        if(fsUtil.isDirectorySync(tmpPath) && file !== version) {
            fsUtil.rmDirSync(tmpPath);
            delCount++;
        }
    });
    if(delCount > 0) {
        log(delCount + '个旧版本已删除 ...');
    }
    cb();
}

// 管理组件目录下的index.js
function updateWidgetIndex(version, widgetPath, rewrite) {
    var filePath = path.join(widgetPath, 'index.js');
    var existsFile = fs.existsSync(filePath);
    if(rewrite || !existsFile) {
        var file = fs.createWriteStream(filePath);
        file.write('module.exports = require("./' + version + '/index.js");');
        file.end();
    }
}

function moveToUpperDirectory(tarPath) {
    var upperDir = path.dirname(tarPath);
    fsUtil.copyDirSync(tarPath, upperDir);
    fsUtil.rmDirSync(tarPath);
}

/**
 * kami组件打包
 *
 * @root kami-source的根路径
 */
function pack(root) {

    if(!fs.existsSync(root)) {
        error('路径 ' + root + '不存在');
        return;
    }

    var infoConfigPath = root + '/info.config';
    if(!fs.existsSync(infoConfigPath)) {
        error('kami-source目录下不存在info.config文件');
        return;
    }

    var infoConfig;
    try {
        infoConfig = JSON.parse(fs.readFileSync(infoConfigPath));
    } catch(e) {
        error('读取 ' + infoConfigPath + ' 失败，失败原因：' + e.message);
        return;
    }


    var total = 0, count = 0;
    log('组件打包开始 ...');

    if (!fs.existsSync(path.join('./tmp'))) {
        fs.mkdirSync(path.join('./tmp'));
    }
    var exclude = ['.git', '.gitignore', '.DS_Store'];

    // 1. 读取该目录下的所有文件
    fs.readdirSync('./').forEach(function(widget) {

        // 2. 通过检查文件夹中是否包含kami.config来判断该文件夹是否为kami组件模块
        var configPath = path.join(widget, 'kami.config');
        if(!fs.existsSync(configPath)) {
            return;
        }

        total++;
        // 3. 将kami组件文件夹拷贝到临时文件夹中
        var tmpPath = path.join('./tmp', widget);
        fsUtil.copyDirSync(widget, tmpPath);

        // 4. 清除文件夹中无用的版本文件
        exclude.forEach(function(ex, index) {
            var exFile = tmpPath + '/' + ex;
            if(fs.existsSync(exFile)) {
                if(index == 0) {
                    fsUtil.rmDirSync(exFile);
                } else {
                    fs.unlinkSync(exFile);
                }
            }
        });

        // 5. 读取该组件的kami.config
        var config;
        try {

            var configPath = path.join(tmpPath, 'kami.config');
            fs.existsSync(configPath) && (config = JSON.parse(fs.readFileSync(configPath)));
        } catch (e) {
            error('读取kami配置文件失败。');
            count++;
            return;
        }

        var version;
        if(config && (version = config.version)) {
            // 6. 在kami-source中创建目录
            var sourcePath = root + '/' + widget;
            fsUtil.mkDirSync(sourcePath);

            // 7. 压缩文件到kami-source中
            var tarFile = sourcePath + '/' + widget + '@' + version +'.map';
            new targz().compress(tmpPath, tarFile, function(err) {
                if(err) {
                    error(widget + '压缩失败！');
                } else {
                    log(widget + '打包成功！');
                }

                // 8. 将打包后的version版本号写入kami-source/info.config中
                if(infoConfig) {
                    var widgets;
                    if(widgets = infoConfig['widgets']) {
                        var currWidget = widgets[widget];
                        if(currWidget) {
                            currWidget.version = version;
                        } else {
                            widgets[widget] = {"version": version, "description": ""};
                        }
                    }
                }

                // 9. 完成所有打包，删除tmp文件夹，把infoConfig回写到info.config中
                if(++count == total) {
                    fsUtil.rmDirSync('./tmp');
                    var file = fs.createWriteStream(infoConfigPath);
                    file.write(JSON.stringify(infoConfig));
                    file.end();
                    log('info.config更新完成 ...');
                    success('组件打包完成！');
                }
            });
        } else {
            error('kami.config中没有version配置');
        }
    });

    !total && warn('没有可以打包的组件！');
}

exports.usage = "kami构建工具"

exports.set_options = function( optimist ){
    optimist.alias('l', 'list');
    optimist.describe('l', '查看kami所提供的组件列表');

    optimist.alias('v', 'version');
    optimist.describe('v', '查看kami构建工具版本号');

    optimist.alias('r', 'remote');
    optimist.describe('r', '源地址，默认: http://ued.qunar.com/kami-source/');

    optimist.alias('a', 'add');
    optimist.describe('a', '添加kami组件');

    optimist.alias('u', 'update');
    optimist.describe('u', '更新kami组件');

    optimist.alias('i', 'install');
    optimist.describe('i', '根据kami.config加载组件');

    optimist.alias('p', 'pack');
    optimist.describe('p', '组件打包，仅供组件开发者使用！');

    //optimist.alias('d', 'del');
    //optimist.describe('d', '移除kami组件');

    //optimist.alias('h', 'history');
    //optimist.describe('h', 'kami组件的历史版本记录');

    optimist.alias('info', 'info');
    optimist.describe('info', '指定组件的版本信息和描述');

    optimist.alias('init', 'init');
    optimist.describe('init', '创建kami.config');

    return optimist;
}

exports.run = function( options ){

    var root = options.cwd,
        config = {},
        taskList = [];

    options.list = options.l;
    options.remote = options.r;
    options.add = options.a;
    options.update = options.u;
    options.version = options.v;
    options.install = options.i;
    options.pack = options.p;

    options.info = options.info;
    options.init = options.init;

    if(options.version) {
        log('kamibuild v' + VERSION);
        return;
    }

    if(options.init) {
        var file = fs.createWriteStream('kami.config');
        var content = '{\n\t"scripts": {\n\t\t"core": "*"\n\t},\n\t"demo": {},\n\t"adapter": {}\n}';
        file.write(content);
        file.end();
        success('初始化成功，已创建kami.config');
        return;
    }

    if(options.pack) {
        var root = options.pack !== true ? options.pack : './kami-source';
        pack(root);
        return;
    }

    taskList.push(getKamiInfo);

    if (options.list) {
        taskList.push(showList());
    }

    if (options.info) {
        if(options.info !== true) {
            taskList.push(showInfo(options.info));
        } else {
            warn('必须指定需要查询的组件名！例如fekit kami -i dialog');
            return;
        }
    } else if (options.install) {
        try {
            var existsKami = fs.existsSync(path.join(root, './kami.config'));
            if(existsKami) { // 优先读取kami.config
                config = JSON.parse(fs.readFileSync(path.join(root, './kami.config')));
            } else { // 读取fekit.config的kami节点
                var fekitConfig = JSON.parse(fs.readFileSync(path.join(root, 'fekit.config')));
                config = fekitConfig['kami'];
            }
        } catch (e) {
            error('读取kami配置文件失败。');
            return;
        }

        var widgets = [];
        for(var key in config.scripts) {
            widgets.push({name: key, version: config.scripts[key]});
        }
        installKami(taskList, widgets, root);
    } else if (options.add) {
        if(options.add !== true) {
            var index = options.add.indexOf('@');
            if(~index) { // 有指定版本号
                var type = options.add.substring(0, index),
                    version = options.add.substring(index + 1);
                taskList.push(addKami(type, version, root));
            } else {
                taskList.push(addKami(options.add, '*', root));
            }
        } else {
            warn('必须指定需要添加的组件名！');
            return;
        }
    }else if (options.update) {
        if(options.update !== true) {
            var index = options.update.indexOf('@');
            if(~index) { // 有指定版本号
                var type = options.update.substring(0, index),
                    version = options.update.substring(index + 1);
                taskList.push(updaeKami(type, version, root));
            } else {
                taskList.push(updaeKami(options.update, '*', root));
            }
        } else {
            warn('必须指定需要更新的组件名！');
            return;
        }
    }

    if(taskList.length == 1) {
        error('输入有误，请输入--help查看kami命令工具帮助');
        return;
    }

    if (!fs.existsSync(path.join(root, './tmp'))) {
        fs.mkdirSync(path.join(root, './tmp'));
    }

    async.series(taskList, function(err, results) {
        fsUtil.rmDirSync(path.join(root, './tmp'));
    });

}