var fs = require('fs'),
    path = require('path'),
    readline = require('readline'),
    request = require('request'),
    async = require('async'),
    colors = require('colors'),
    targz = require('tar.gz'),
    fsUtil = require('./fs-util');

// 下载地址
var DOWNLOAD_URL = 'http://ued.qunar.com/mobile/source/kami/';
//var DOWNLOAD_URL = 'http://localhost:4369/kami/';
// 上传地址
var UPLOAD_URL = 'http://l-uedmobile0.h.dev.cn0.qunar.com:4369/upload?';
//var UPLOAD_URL = 'http://localhost:4369/upload?';
// 当前版本号
var VERSION = '0.2.1';
// info.config加载到的配置
var kamiInfo = null;
// kami-widget默认安装的目录
var kamiWidgets = 'src/kami/scripts';
// kami-demo默认安装的目录
var kamiDemo = 'src/kami/';
// kami-adapter默认安装的目录
var kamiAdapter = 'src/kami/adapter';
// kami配置文件默认文件名（每个widget/adapter目录下）
var kamiConfigFile = 'kami.config';
// kami资源信息默认文件名（kami-source目录下）
var kamiInfoFile = 'info.config';
// 排除的文件
var excludeFile = ['.git', '.gitignore', '.DS_Store'];

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
var info = function(msg) {
    log(msg.cyan);
}

// 满足semver的语义化版本规则
function checkVersion(version) {
    return /^\d+\.\d+\.\d+$/.test(version);
}

// 显示已提供的kami组件信息
function showList() {
    return function(cb) {
        var widgets = kamiInfo;
        info('kami组件列表信息：');
        log('------------------------------------');
        for(var name in widgets) {
            var space = name.length > 7 ? '\t' : '\t\t';
            log(name + space + widgets[name].version + '\t\t' + widgets[name].description);
        }
        cb(null);
    };
}

// 显示本地已安装的kami组件信息
function showLocalList(root) {
    var widgetsRoot = path.join(root, kamiWidgets);
    if(fs.existsSync(widgetsRoot)) {
        info('kami组件列表信息（local）：');
        log('------------------------------------');
        fs.readdirSync(widgetsRoot).forEach(function(widget) {
            var widgetPath = path.join(widgetsRoot, widget);
            fs.readdirSync(widgetPath).forEach(function(version) {
                if(checkVersion(version)) {
                    var space = widget.length > 7 ? '\t' : '\t\t';
                    log(widget + space + version);
                }
            });
        });
    } else {
        warn('目录 ' + root + ' 下不存在kami组件');
    }
}

// 显示单个组件详细信息
function showInfo(type) {
    return function(cb) {
        var widgets = kamiInfo;
        if (widgets[type]) {
            log('------------------------------------');
            log('组件名称：' + type);
            log('最新版本：' + widgets[type].version);
            log('组件描述：' + (widgets[type].description || '无'));
            log('更新时间：' + (widgets[type].update_time || '无'));
            log('源码地址：' + (widgets[type].url || '无'));
            log('------------------------------------');
        } else {
            error('组件"' + type + '"不存在');
        }
        cb(null);
    };
}

// 从服务器获取组件最新版本号
function getKamiInfo(cb) {
    var url = DOWNLOAD_URL + kamiInfoFile;
    request(url, function(err, res, body) {
        if (!err && res.statusCode === 200) {
            try {
                kamiInfo = JSON.parse(body);
            } catch (e) {
                error(kamiInfoFile + '解析失败。');
                return;
            }
            cb(null);
        } else {
            error(url+' 下载失败！');
        }
    });
}

// 通过kami.config安装kami组件
function installWidget(taskList, widgets, root) {
    if(!widgets.length) {
        warn('请在"'+kamiConfigFile+'"的scripts节点配置需要安装的组件！');
        return false;
    }
    var kamiPath = path.join(root, kamiWidgets);
    fsUtil.rmDirSync(kamiPath);
    fsUtil.mkDirSync(kamiPath);
    widgets.forEach(function(widget) {
        taskList.push(addWidget(widget.name, widget.version, root));
    });
    return true;
}

// 安装demo
function addDemo(widget, version, root, cb) {

    if(!checkVersion(version)) {
        warn('版本号 ' + version + ' 有误，请遵循semver语义化版本规则！');
        cb(null);
        return;
    }

    var demoPath = path.join(root, kamiDemo);

    // 创建demo目录
    fsUtil.mkDirSync(demoPath)

    // 下载
    var url = DOWNLOAD_URL + widget + '/' + version + '/' + widget + '.map'
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
                demoPath,
                function (err) {
                    if (err) {
                        error('解压 ' + tmpPath + ' 失败！')
                        cb(null);
                    } else {
                        success('安装 ' + widget + ' 成功 ...');
                        cb(null);
                    }
                }
            );
        } else {
            error('下载 ' + url + ' 失败！')
            cb(null);
        }
    });
}

// 安装适配器
function addAdapter(widget, version, root, cb) {

    if(!checkVersion(version)) {
        warn('版本号 ' + version + ' 有误，请遵循semver语义化版本规则！');
        cb(null);
        return;
    }

    var adapterPath = path.join(root, kamiAdapter);

    // 创建adapter目录
    fsUtil.mkDirSync(adapterPath);

    // 下载
    var url = DOWNLOAD_URL + widget + '/' + version + '/' + widget + '.map'
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
                adapterPath,
                function (err) {
                    if (err) {
                        error('解压 ' + tmpPath + ' 失败！')
                        cb(null);
                    } else {
                        // 重命名adapter-xxx 目录 为 xxx
                        var simpleName = widget.substring('adapter-'.length);
                        var oldPath = path.join(adapterPath, widget);
                        var newPath = path.join(adapterPath, simpleName);
                        fs.existsSync(newPath) && fsUtil.rmDirSync(newPath);
                        fs.renameSync(oldPath, newPath);

                        success('安装 ' + widget + ' 成功 ...');
                        cb(null);
                    }
                }
            );
        } else {
            error('下载 ' + url + ' 失败！')
            cb(null);
        }
    });
}

// 添加单个组件
function addSingleWidget(type, version, root, cb) {

    if(!checkVersion(version)) {
        cb('版本号 ' + version + ' 有误，请遵循semver语义化版本规则！');
        return;
    }

    // 判断本地是否已存在该版本
    var widget = type + '@' + version;
    var localPath = path.join(root, kamiWidgets, type);
    var widgetPath = path.join(localPath, version);
    if(fs.existsSync(widgetPath)) {
        cb(widget + '已存在。', true);
        if(!fs.existsSync(path.join(localPath, 'index.js'))) {
            updateWidgetIndex(version, type, localPath, true);
        }
        return;
    }

    // 创建目录
    fsUtil.mkDirSync(localPath);
    // 下载
    var url = DOWNLOAD_URL + type + '/' + version + '/' + type + '.map';
    request({
        url: url,
        encoding: null
    }, function (err, res, body) {
        if (!err && res.statusCode === 200) {
            // 写入临时文件夹创建
            var tmpFile = path.join(root, 'tmp', '' + widget + '.tar.gz');
            fs.writeFileSync(tmpFile, body);

            // 解压
            new targz().extract(
                tmpFile,
                widgetPath,
                function (err) {
                    if (err) {
                        cb('解压 ' + tmpFile + ' 失败！');
                    } else {
                        fsUtil.moveToUpperDirSync(path.join(widgetPath, type));
                        cb(null, false, widgetPath, widget);
                    }
                }
            );
        } else {
            !fsUtil.fileListSync(localPath).length && fsUtil.rmDirSync(localPath);
            cb('下载 ' + url + ' 失败！', false, widgetPath, widget);
        }
    });
}

// 根据依赖注入版本号
function injectVersion(widgetPath, dependWidgets) {
    var srcDir = path.join(widgetPath, 'src');
    var getReg = function(widget) {
        return new RegExp('(require.+\/'+widget+'\/)index.js', 'im');
    };
    fsUtil.fileListSync(srcDir).forEach(function(file) {
        var srcFile = path.join(srcDir, file);
        if(fsUtil.isFileSync(srcFile)) {
            var inject = false;
            var content = fs.readFileSync(srcFile, 'utf8');
            for(var name in dependWidgets) {
                content = content.replace(getReg(name), function($1,$2) {
                    inject = true;
                    // 因为添加了版本号，增加了一层路径
                    return $2.replace('../', '../../') + dependWidgets[name] + '/index.js';
                });
            }
            inject && fs.writeFileSync(srcFile, content);
        }
    });
}

// 获取组件依赖
function getDependence(widgetRoot) {
    try{
        var widgetConfig = JSON.parse(fs.readFileSync(path.join(widgetRoot, kamiConfigFile)));
        return widgetConfig['dependance'];
    } catch(e) {
        error('读取组件配置文件失败！');
        return null;
    }
}

// 添加完整的kami组件,包括依赖
function addWidget(type, version, root) {
    var total = 0,
        count = 0,
        fail = false,
        dependencies = [];
    // TODO 安装失败后，清除安装的依赖，优化代码
    return function(cb) {

        if(!kamiInfo[type]) {
            error(type + ' 组件不存在。');
            cb(null);
            return;
        }

        version == "*" && (version = kamiInfo[type].version);
        var widget = type + '@' + version;
        log('开始安装 ' + widget + ' ...');

        if(type == "demo") {// demo安装
            addDemo(type, version, root, cb);
            return;
        } else if (type.indexOf('adapter-') === 0) {// adapter安装
            addAdapter(type, version, root, cb);
            return;
        } else {// widget安装
            total++;
        }

        var callback = function(errMsg, exists, widgetRoot, currWidget) {
            if(exists) {
                if(count === 0) {
                    warn(errMsg);
                    cb(null);
                } else {
                    count++;
                }
            } else if(errMsg) {
                count++;
                fail = true;
                error(errMsg);
                if(count != 1) {
                    warn('安装依赖 ' + currWidget + '  失败！');
                }
                if(count == total) {
                    fsUtil.rmDirSync(path.join(root, kamiWidgets, type));
                    total = count = 0;
                    fail = false;
                    error('安装 ' + widget + ' 失败！');
                    cb(null);
                }
            } else {
                count++;
                if(count != 1) {
                    log('安装依赖 ' + currWidget + ' 成功 ...');
                }
                var widgets = getDependence(widgetRoot);
                if(widgets) {
                    injectVersion(widgetRoot, widgets);
                    for(var name in widgets) {
                        total++;
                        addSingleWidget(name, widgets[name], root, callback);
                    }
                }
                if(count == total) {
                    if(fail) {
                        fsUtil.rmDirSync(path.join(root, kamiWidgets, type));
                        fail = false;
                        total = count = 0;
                        error('安装 ' + widget + ' 失败！');
                        cb(null);
                    } else {
                        updateWidgetIndex(version, type, path.join(root, kamiWidgets, type), false);
                        fail = false;
                        total = count = 0;
                        success('安装 ' + widget + ' 成功 ...');
                        cb(null);
                    }
                }
            }
        };

        addSingleWidget(type, version, root, callback);
    }
}

// 更新kami组件
function updateWidget(type, version, root) {
    var total = 0,
        count = 0,
        fail = false;
    return function(cb) {

        if(!kamiInfo[type]) {
            error(type + ' 组件不存在。');
            cb(null);
            return;
        }

        // 判断本地是否已存在该组件
        var widgetRootPath = path.join(root, kamiWidgets, type);
        if(!fs.existsSync(widgetRootPath) || !fsUtil.fileListSync(widgetRootPath).length) {
            error(type + ' 还未安装，请先执行安装才能进行更新！。');
            cb(null);
            return;
        }

        var versionList = [];
        fs.readdirSync(widgetRootPath).forEach(function(version) {
            checkVersion(version) && versionList.push(version);
        });
        if(versionList.length === 0) {
            error(type + ' 不存在已安装版本，请先执行安装才能进行更新！。');
            cb(null);
            return;
        }

        if(version == "*") {
            version = kamiInfo[type].version;
            log('查询到 ' + type + ' 的最新版本：' + version);
        } else {
            if(~versionList.indexOf(version)) {
                error('指定更新的版本号 ' + version + ' 当前系统已存在！');
                cb(null);
                return;
            }
            if(!compareVersion(versionList[versionList.length - 1], version)) {
                error('指定更新的版本号 ' + version + ' 小于系统已存在的版本！');
                cb(null);
                return;
            }
            log('更新 ' + type + ' 到指定版本：' + version);
        }

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
                count++;
                fail = true;
                error(errMsg);
                if(count != 1) {
                    warn('安装依赖 ' + currWidget + '  失败！');
                }
                if(count == total) {
                    fsUtil.rmDirSync(path.join(root, kamiWidgets, type, version));
                    total = count = 0;
                    fail = false;
                    error('安装 ' + widget + ' 失败！');
                    cb(null);
                }
            } else {
                count++;
                if(count != 1) {
                    log('安装依赖 ' + currWidget + ' 成功 ...');
                }
                var widgets = getDependence(widgetRoot);
                if(widgets) {
                    injectVersion(widgetRoot, widgets);
                    for (var name in widgets) {
                        total++;
                        addSingleWidget(name, widgets[name], root, callback);
                    }
                }
                if(count == total) {
                    updateWidgetIndex(version, type, path.join(root, kamiWidgets, type), true);
                    success('安装 ' + widget + ' 成功 ...');
                    total = count = 0;
                    deleteOldVersion(type, version, root, function() {
                        cb(null);
                    });

                    if(fail) {
                        fsUtil.rmDirSync(path.join(root, kamiWidgets, type, version));
                        fail = false;
                        total = count = 0;
                        error('安装 ' + widget + ' 失败！');
                        cb(null);
                    } else {
                        updateWidgetIndex(version, type, path.join(root, kamiWidgets, type), true);
                        fail = false;
                        total = count = 0;
                        success('安装 ' + widget + ' 成功 ...');
                        deleteOldVersion(type, version, root, function() {
                            cb(null);
                        });
                    }
                }
            }
        };

        addSingleWidget(type, version, root, callback);
    }
}

// 删除旧版本
function deleteOldVersion(type, version, root, cb) {
    var widgetPath = path.join(root, kamiWidgets, type);
    var delVersion = '', delDir = [];
    fs.readdirSync(widgetPath).forEach(function(file) {
        var tmpPath = path.join(widgetPath, file);
        if(fsUtil.isDirSync(tmpPath) && file !== version) {
            delDir.push(tmpPath);
            delVersion = file;
        }
    });

    // 只有一个版本的情况才会删除旧版本
    if(delDir.length == 1) {
        fsUtil.rmDirSync(delDir[0]);
        warn('旧版本' + type + '@' + delVersion + '已被删除 ...');
    } else {
        warn(type + '存在多版本，请手动删除不需要的版本 ...');
    }

    success(type + '已更新到最新的版本：' + version);
    cb();
}

// 管理组件目录下的index.js
function updateWidgetIndex(version, widget, widgetPath, rewrite) {
    var filePath = path.join(widgetPath, 'index.js');
    var existsFile = fs.existsSync(filePath);
    if (rewrite || !existsFile) {
        var fileCntArr = [];
        //fix fekit bugs and widget name is js keyword
        fileCntArr.push('var obj = {};');
        fileCntArr.push('obj["{{widget}}"] = require("./{{version}}/index.js");');
        fileCntArr.push('module.exports = obj["{{widget}}"];');

        var fileCnt = fileCntArr.join('\n');
        fileCnt = fileCnt.replace(/\{\{widget\}\}/g, widget);
        fileCnt = fileCnt.replace(/\{\{version\}\}/g, version);

        fs.writeFileSync(filePath, fileCnt);
    }
}

// 删除kami组件
function deleteWidget(type, version, root) {
    // 判断本地是否已存在该组件
    var widgetRootPath = path.join(root, kamiWidgets, type);
    if(!fs.existsSync(widgetRootPath)) {
        error('"' + type + '"还未安装，无法删除！');
        return;
    } else {
        if(version == "*") {
            fsUtil.rmDirSync(widgetRootPath);
        } else {
            widgetRootPath = path.join(widgetRootPath, version);
            if(!fs.existsSync(widgetRootPath)) {
                error('"' + type + '@' + version + '"还未安装，无法删除！');
                return;
            } else {
                fsUtil.rmDirSync(widgetRootPath);
            }
        }

        var widget = version == "*" ? type : type + '@' + version;
        success('组件"' + widget + '"删除成功！');
    }
}

/**
 * kami组件打包
 *
 * @taskList 异步队列
 * @root 命令执行的根路径
 * @widgets kami组件，允许多个一起发布，widget1 | widget2
 * @force 强制发布
 */
function publish(taskList, root, widgets, force) {

    var widgetRoot = path.join(root, kamiWidgets);
    if(!fs.existsSync(widgetRoot)) {
        warn('目录 ' + root + ' 下不存在kami组件');
        return
    }

    log('组件打包发布开始 ...');

    // 创建临时文件夹
    var tmpPath = path.join(widgetRoot, './tmp');
    !fs.existsSync(tmpPath) && fs.mkdirSync(tmpPath);

    // 打包
    var result = {packSuccess: true};
    taskList.push(function(cb) {
        if(force) {
            var rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question('确认强制覆盖发布吗？Y/N'.yellow + '\n', function(answer) {
                if(answer != 'n' && answer != 'N') {
                    cb(null);
                } else {
                   error('发布中止！');
                }
                rl.close();
            });
        } else {
            cb(null);
        }
    });

    var widgetsArr = widgets.split(/\s*\/\s*/);
    widgetsArr.forEach(function(widget) {
        taskList.push(singlePack(widget, root, tmpPath, force, result));
    });

    // 把config写到info.config中
    taskList.push(function(cb) {
        if(result.packSuccess) {
            var filePath = path.join(tmpPath, kamiInfoFile);
            var data = JSON.stringify(kamiInfo, null, 4);
            fs.writeFile(filePath, data, function(err) {
                if(!err) {
                    log(kamiInfoFile + '更新成功');
                }
                cb(null);
            });
        } else {
            cb(null);
        }
    });

    // 发布
    taskList.push(function(cb) {
        if(result.packSuccess) {
            var fileList = fsUtil.fileListSync(tmpPath);
            var flag = {leng: fileList.length, count: 0};
            fileList.forEach(function (file) {
                singlePublish(tmpPath, file, cb, flag);
            });
        } else {
            cb(null);
        }
    });

    // 清除临时文件夹
    taskList.push(function(cb) {
        !result.packSuccess && error('发布失败，请更新版本号后发布，或者使用--force || -f 强制发布！');
        fsUtil.rmDirSync(tmpPath);
        cb(null);
    });
}

// 单个打包
function singlePack(widget, root, tmpRoot, force, result) {

    return function(cb) {

        var widgetRoot = '', widgetName = widget;
        if(widget.indexOf('adapter-') === 0) {
            widgetRoot = path.join(root, kamiAdapter);
            widgetName = widget.substring('adapter-'.length);
        } else if(widget === 'demo') {
            widgetRoot = path.join(root, kamiDemo);
        } else {
            widgetRoot = path.join(root, kamiWidgets);
        }

        var widgetPath = path.join(widgetRoot, widgetName);

        // 1. 通过检查文件夹中是否包含kami.config来判断该文件夹是否为kami组件模块
        var configPath = path.join(widgetPath, kamiConfigFile);
        if (!fs.existsSync(configPath)) {
            cb(null);
            return;
        }

        // 2. 将kami组件文件夹拷贝到临时文件夹中
        var tmpPath = path.join(tmpRoot, widget);
        fsUtil.copyDirSync(widgetPath, tmpPath);

        // 3. 清除文件夹中无用的版本文件
        excludeFile.forEach(function (ex, index) {
            var exFile = path.join(tmpPath, ex);
            if (fs.existsSync(exFile)) {
                if (index == 0) {
                    fsUtil.rmDirSync(exFile);
                } else {
                    fs.unlinkSync(exFile);
                }
            }
        });

        // 4. 读取该组件的kami.config
        var config;
        try {
            var configPath = path.join(tmpPath, kamiConfigFile);
            fs.existsSync(configPath) && (config = JSON.parse(fs.readFileSync(configPath)));
        } catch (e) {
            error('读取kami配置文件失败。');
            cb(null);
            return;
        }

        var version;
        if (config && (version = config.version)) {
            // 5. 比较版本是否有升级
            var currWidget = kamiInfo[widget];
            if (currWidget) {
                if (currWidget.version === version) {
                    warn('当前打包版本 ' + widget + '@' + version + ' 与' + kamiInfoFile + '中配置的版本号一样！');
                    if(!force) {
                        result.packSuccess = false;
                        cb(null);
                        return;
                    }
                } else if (!compareVersion(currWidget.version, version)) {
                    result.packSuccess = false;
                    error('当前打包版本 ' + widget + '@' + version + ' 小于' + kamiInfoFile + '中配置的版本号！');
                    cb(null);
                    return;
                }
            }

            // 6. 压缩
            var tarFile = path.join(tmpRoot, widget + '.map');
            new targz().compress(tmpPath, tarFile, function (err) {
                if (err) {
                    error(widget + '@' + version + '压缩失败！');
                    cb(null);
                    return;
                } else {
                    log(widget + '@' + version + '打包成功！');
                }

                // 7. 更新配置
                if (currWidget) {
                    currWidget.version = version;
                    currWidget.update_time = formateDate(new Date());
                } else {
                    currWidget = {};
                    currWidget.version = version;
                    currWidget.update_time = formateDate(new Date());
                    currWidget.description = "";
                    kamiInfo[widget] = currWidget;
                }

                // 8. 删除组件的临时文件夹
                fsUtil.rmDirSync(tmpPath);

                cb(null);
            });
        } else {
            error(kamiConfigFile + '中没有version配置');
        }
    }
}

// 单个发布
function singlePublish(tmpRoot, file, cb, flag) {
    var widget = '';
    var param = 'kami/';
    var name = file.substring(0, file.lastIndexOf('.'));
    var type = file.substring(file.lastIndexOf('.') + 1);
    if(type == 'map') {
        param += name + '/' + kamiInfo[name].version + '/'
        widget = name + '@' + kamiInfo[name].version;
    } else {
        widget = kamiInfoFile;
    }

    var url = UPLOAD_URL + 'path=' + encodeURIComponent(param);
    var options = {
        url: url,
        formData: {
            file: fs.createReadStream(path.join(tmpRoot, file))
        }
    };

    request.post(options, function(err, res) {
        if (!err && res.statusCode === 200) {
            if (res.statusCode === 200) {
                success(widget + ' 上传成功！');
            } else {
                error(widget + ' 上传失败！');
            }
        } else {
            error(err);
        }
        if(++flag.count == flag.leng) {
            cb(null);
        }
    });
}

function getKamiConfig(root) {
    var config = null;
    try {
        var existsKami = fs.existsSync(path.join(root, kamiConfigFile));
        if(existsKami) { // 优先读取kami.config
            config = JSON.parse(fs.readFileSync(path.join(root, kamiConfigFile)));
        } else { // 读取fekit.config的kami节点
            var fekitConfig = JSON.parse(fs.readFileSync(path.join(root, 'fekit.config')));
            config = fekitConfig['kami'];
        }
    } catch (e) {
        error('读取"' + root + '"目录下的kami配置文件失败。');
    }
    return config;
}

// 时间格式化
function formateDate(date) {
    var t = function(num) {
        return num < 10 ? '0' + num : num;
    };
    var y = date.getFullYear(),
        m = t(date.getMonth() + 1),
        d = t(date.getDate()),
        h = t(date.getHours()),
        mi = t(date.getMinutes()),
        s = t(date.getSeconds());
    return y + '-' + m + '-' + d + ' ' + h + ':' + mi + ':' + s;
}

// 版本比较
function compareVersion(oldVersion, newVersion) {
    var reg = /(\d+)\.(\d+)\.(\d+)/;
    var oldArr = oldVersion.match(reg),
        newArr = newVersion.match(reg);
    if(+newArr[1] > +oldArr[1]) {
        return true;
    } else if(+newArr[2] > +oldArr[2]){
        if(+newArr[1] == +oldArr[1]) {
            return true;
        } else {
            return false;
        }
    } else if(+newArr[3] > +oldArr[3]) {
        if(+newArr[1] == +oldArr[1] && +newArr[2] == +oldArr[2]) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

// 显示构建工具版本信息
function showVersion() {
    log('kamibuild v' + VERSION);
}

function init(root) {
    var file = path.join(root, kamiConfigFile);
    if(fs.existsSync(root)) {
        if(fs.existsSync(file)) {
            warn('已存在' + kamiConfigFile + '文件，先将其删除才能执行init命令');
            return;
        }
    } else {
        fsUtil.mkDirSync(root);
    }

    fs.writeFile(file, '{\n\t"scripts": {}\n}', function(err) {
        if(!err) {
            success('初始化成功，已创建'+kamiConfigFile);
        } else {
            if(err.errno == 3) {
                error('初始化失败，在目录 ' + root + ' 下没有权限创建文件');
            } else {
                console.error(err);
            }
        }
    });
}

exports.usage = "kami构建工具"

exports.set_options = function( optimist ){

    optimist.describe('init', 'kami组件初始化。');

    optimist.alias('i', 'install');
    optimist.describe('i', '根据配置'+kamiConfigFile+'加载组件');

    optimist.alias('l', 'list');
    optimist.describe('l', '查看kami所有的组件列表。');

    optimist.describe('local', '查看本地安装的kami组件列表。');

    optimist.alias('a', 'add');
    optimist.describe('a', '添加kami组件');

    optimist.alias('u', 'update');
    optimist.describe('u', '更新kami组件');

    optimist.alias('d', 'del');
    optimist.describe('d', '删除kami组件');

    optimist.describe('info', '指定组件的详细信息。');

    optimist.alias('v', 'version');
    optimist.describe('v', '查看kami构建工具版本号');

    //optimist.alias('r', 'remote');
    //optimist.describe('r', '源地址，默认: http://ued.qunar.com/mobile/source/kami/');

    //optimist.alias('h', 'history');
    //optimist.describe('h', 'kami组件的历史版本记录');

    optimist.alias('p', 'publish');
    optimist.describe('p', '发布组件【开发者使用】');

    optimist.alias('f', 'force');
    optimist.describe('f', '强制发布组件，版本号一样时使用【开发者使用】');

    optimist.describe('path', '指定路径,支持绝对和相对路径');

    optimist.describe('detail', '详细帮助参见https://github.com/sprintsun/fekit-extension-kami');

    return optimist;
}

exports.run = function( options ){

    var root;
    var cwd = options.cwd;
    var customPath = options.path;

    if(customPath) {
        if(customPath !== true) {
            root = customPath.charAt(0) == '/' ? customPath : path.join(cwd, customPath);
        } else {
            error('输入有误，请输入--help查看kami命令工具帮助');
            return;
        }
    } else {
        root = cwd;
    }

    options.list = typeof options.l == "undefined" ? options.list : options.l;
    options.install = typeof options.i == "undefined" ? options.install : options.i;
    options.add = typeof options.a == "undefined" ? options.add : options.a;
    options.update = typeof options.u == "undefined" ? options.update : options.u;
    options.del = typeof options.d == "undefined" ? options.del : options.d;
    options.version = typeof options.v == "undefined" ? options.version : options.v;
    options.publish = typeof options.p == "undefined" ? options.publish : options.p;
    options.force = typeof options.f == "undefined" ? options.force : options.f;

    if(options.version) {
        showVersion();
    } else if(options.init) {
        init(root);
    } else if(options.local) {
        showLocalList(root);
    } else if (options.del) {
        if(options.del !== true) {
            var index = options.del.indexOf('@');
            if(~index) { // 有指定版本号
                var type = options.del.substring(0, index),
                    version = options.del.substring(index + 1);
                deleteWidget(type, version, root);
            } else {
                deleteWidget(options.del, '*', root);
            }
        } else {
            warn('必须指定需要删除的组件名！');
        }
    } else {
        var taskList = [];

        taskList.push(getKamiInfo);

        if (options.list) {
            taskList.push(showList());
        } else if (options.info) {
            if(options.info !== true) {
                taskList.push(showInfo(options.info));
            } else {
                warn('必须指定需要查询的组件名！例如fekit kami -i dialog');
                return;
            }
        } else if (options.install) {
            var config = getKamiConfig(root);
            if(config && config.scripts) {
                var widgets = [];
                for(var key in config.scripts) {
                    widgets.push({name: key, version: config.scripts[key]});
                }
                if(!installWidget(taskList, widgets, root)) {
                    return;
                }
            } else {
                return;
            }
        } else if (options.add) {
            if(options.add !== true) {
                var index = options.add.indexOf('@');
                if(~index) { // 有指定版本号
                    var type = options.add.substring(0, index),
                        version = options.add.substring(index + 1);
                    taskList.push(addWidget(type, version, root));
                } else {
                    taskList.push(addWidget(options.add, '*', root));
                }
            } else {
                warn('必须指定需要添加的组件名！');
                return;
            }
        } else if (options.update) {
            if(options.update !== true) {
                var index = options.update.indexOf('@');
                if(~index) { // 有指定版本号
                    var type = options.update.substring(0, index),
                        version = options.update.substring(index + 1);
                    taskList.push(updateWidget(type, version, root));
                } else {
                    taskList.push(updateWidget(options.update, '*', root));
                }
            } else {
                warn('必须指定需要更新的组件名！');
                return;
            }
        } else if(options.publish) {
            if(options.publish !== true) {
                publish(taskList, cwd, options.publish, options.force || false);
            } else {
                warn('必须指定需要打包的组件名！');
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

        async.series(taskList, function() {
            fsUtil.rmDirSync(path.join(root, './tmp'));
        });
    }
}