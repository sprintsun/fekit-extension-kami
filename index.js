var fs = require('fs'),
    path = require('path'),
    request = require('request'),
    async = require('async'),
    colors = require('colors'),
    targz = require('tar.gz'),
    fsUtil = require('./fs-util');

var BASE_URL = 'http://ued.qunar.com/kami-source/';
var VERSION = '0.0.5';
var kamiInfo = null;
var kamiSource = 'src/kami';
var kamiConfigFile = 'kami.config';
var kamiInfoFile = 'info.config';

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

// 显示kami组件列表信息
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

function showLocalList(root) {
    if(fs.existsSync(root)) {
        var widgetsRoot = path.join(root, kamiSource);
        if(fs.existsSync(widgetsRoot)) {
            log('本地安装的kami组件列表信息：');
            log('------------------------------------');
            fs.readdirSync(widgetsRoot).forEach(function(widget) {
                var widgetPath = path.join(widgetsRoot, widget);
                fs.readdirSync(widgetPath).forEach(function(version) {
                    checkVersion(version) && log(widget + ': ' + version);
                });
            });
        } else {
            error('目录 ' + root + ' 下不存在kami组件');
        }
    } else {
        error('不存在路径：' + root);
    }
}

// 显示单个组件详细信息
function showInfo(type) {
    return function(cb) {
        var widgets = kamiInfo.widgets;
        if (widgets && widgets[type]) {
            log('------------------------------------');
            log('名称：' + type);
            log('最新版本：' + widgets[type].version);
            log('描述：' + (widgets[type].description || '无'));
            log('更新时间：' + (widgets[type].update_time || '无'));
            log('源码地址：' + (widgets[type].url || '无'));
        } else {
            warn('kami组件库不存在：' + type);
        }
        cb(null);
    };
}

// 从服务器获取组件最新版本号
function getKamiInfo(cb) {
    var url = BASE_URL + kamiInfoFile;
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
            error('从 '+url+' 下载'+kamiInfoFile+'失败！');
        }
    });
}

// 通过kami.config安装kami组件
function installWidget(taskList, widgets, root) {
    if(!widgets.length) {
        warn('请在'+kamiConfigFile+'配置需要安装的组件！');
        return false;
    }
    var kamiPath = path.join(root, kamiSource);
    fsUtil.rmDirSync(kamiPath);
    fsUtil.mkDirSync(kamiPath);
    widgets.forEach(function(widget) {
        taskList.push(addWidget(widget.name, widget.version, root));
    });
    return true;
}

// 添加单个组件
function addSingleWidget(type, version, root, cb) {

    if(!checkVersion(version)) {
        cb('版本号 ' + version + ' 有误，请遵循semver语义化版本规则！');
        return;
    }

    // 判断本地是否已存在该版本
    var widget = type + '@' + version;
    var localPath = path.join(root, kamiSource, type);
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
                        fsUtil.moveToUpperDirSync(path.join(widgetPath, type));
                        cb(null, false, widgetPath, widget);
                    }
                }
            );
        } else {
            cb('下载 ' + url + ' 失败！');
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
                    return $2 + dependWidgets[name] + '/index.js';
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
        count = 0;
    return function(cb) {

        if(!kamiInfo) {
            error('加载不到'+kamiConfigFile);
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
                if(widgets) {
                    injectVersion(widgetRoot, widgets);
                    for(var name in widgets) {
                        total++;
                        addSingleWidget(name, widgets[name], root, callback);
                    }
                }
                if(count == total) {
                    updateWidgetIndex(version, path.join(root, kamiSource, type), false);
                    success('安装 ' + widget + ' 成功 ...');
                    total = count = 0;
                    cb(null);
                }
            }
        };

        addSingleWidget(type, version, root, callback);
    }
}

// 更新kami组件
function updateWidget(type, version, root) {
    var total = 0,
        count = 0;
    return function(cb) {

        if(!kamiInfo) {
            error('加载不到' + kamiConfigFile);
            cb(null);
            return;
        }
        if(!kamiInfo['widgets'] || !kamiInfo['widgets'][type]) {
            error(type + ' 组件不存在。');
            cb(null);
            return;
        }

        // 判断本地是否已存在该组件
        var widgetRootPath = path.join(root, kamiSource, type);
        if(!fs.existsSync(widgetRootPath) || !fsUtil.fileListSync(widgetRootPath).length) {
            error(type + ' 还未安装，请先执行安装才能进行更新！。');
            cb(null);
            return;
        }

        version == "*" && (version = kamiInfo.widgets[type].version);
        log('查询到 ' + type + ' 的最新版本：' + version);
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
                if(widgets) {
                    injectVersion(widgetRoot, widgets);
                    for (var name in widgets) {
                        total++;
                        addSingleWidget(name, widgets[name], root, callback);
                    }
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

        addSingleWidget(type, version, root, callback);
    }
}

// 删除旧版本
function deleteOldVersion(type, version, root, cb) {
    var widgetPath = path.join(root, kamiSource, type);
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
function updateWidgetIndex(version, widgetPath, rewrite) {
    var filePath = path.join(widgetPath, 'index.js');
    var existsFile = fs.existsSync(filePath);
    if(rewrite || !existsFile) {
        var file = fs.createWriteStream(filePath);
        file.write('module.exports = require("./' + version + '/index.js");');
        file.end();
    }
}

// 删除kami组件
function deleteWidget(type, version, root) {
    // 判断本地是否已存在该组件
    var widgetRootPath = path.join(root, kamiSource, type);
    if(!fs.existsSync(widgetRootPath)) {
        error(type + ' 还未安装，无法删除！');
        return;
    } else {
        if(version == "*") {
            fsUtil.rmDirSync(widgetRootPath);
        } else {
            widgetRootPath = path.join(widgetRootPath, version);
            if(!fs.existsSync(widgetRootPath)) {
                error(type + '@' + version + ' 还未安装，无法删除！');
                return;
            } else {
                fsUtil.rmDirSync(widgetRootPath);
            }
        }

        var widget = version == "*" ? type : type + '@' + version;
        success(widget + '删除成功！');
    }
}

/**
 * kami组件打包
 *
 * @root kami-source的根路径
 * @widget 组件，如果有该参数则执行单个组件打包
 */
function pack(root, widget) {

    if(!fs.existsSync(root)) {
        error('路径 ' + root + '不存在');
        return;
    }

    var infoConfigPath = path.join(root, kamiInfoFile);
    if(!fs.existsSync(infoConfigPath)) {
        error('kami-source目录下不存在'+kamiInfoFile+'文件');
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

    // 单个打包
    var singlePack = function(widget) {

        var exclude = ['.git', '.gitignore', '.DS_Store'];

        // 1. 通过检查文件夹中是否包含kami.config来判断该文件夹是否为kami组件模块
        var configPath = path.join(widget, kamiConfigFile);
        if(!fs.existsSync(configPath)) {
            return;
        }

        total++;
        // 2. 将kami组件文件夹拷贝到临时文件夹中
        var tmpPath = path.join('./tmp', widget);
        fsUtil.copyDirSync(widget, tmpPath);

        // 3. 清除文件夹中无用的版本文件
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

        // 4. 读取该组件的kami.config
        var config;
        try {

            var configPath = path.join(tmpPath, kamiConfigFile);
            fs.existsSync(configPath) && (config = JSON.parse(fs.readFileSync(configPath)));
        } catch (e) {
            error('读取kami配置文件失败。');
            count++;
            return;
        }

        var version;
        if(config && (version = config.version)) {

            // 5. 比较版本是否有升级
            var currWidget = infoConfig['widgets'][widget];
            if(currWidget) {
                if(currWidget.version === version) {
                    error('当前打包版本 ' + widget + '@' + version + ' 与'+kamiInfoFile+'中配置的版本号一样， 你是猪头吗！');
                    count++;
                    return;
                }
                if(!compareVersion(currWidget.version, version)) {
                    error('当前打包版本 ' + widget + '@' + version + ' 小于'+kamiInfoFile+'中配置的版本号， 你是猪头吗！');
                    count++;
                    return;
                }
            }

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
                if(currWidget) {
                    currWidget.version = version;
                    currWidget.update_time = formateDate(new Date());
                } else {
                    currWidget = {};
                    currWidget.version = version;
                    currWidget.update_time = formateDate(new Date());
                    currWidget.description = "";
                    infoConfig['widgets'][widget] = currWidget;
                }

                // 9. 完成所有打包，删除tmp文件夹，把infoConfig回写到info.config中
                if(++count == total) {
                    fsUtil.rmDirSync('./tmp');
                    var file = fs.createWriteStream(infoConfigPath);
                    file.write(JSON.stringify(infoConfig));
                    file.end();
                    log(kamiInfoFile + '更新完成 ...');
                    success('组件打包完成！');
                }
            });
        } else {
            error(kamiConfigFile + '中没有version配置');
        }
    }

    log('组件打包开始 ...');

    if (!fs.existsSync(path.join('./tmp'))) {
        fs.mkdirSync(path.join('./tmp'));
    }

    if(widget) {
        if(fs.existsSync(path.join(widget))) {
            singlePack(widget);
        } else {
            error('不存在组件' + widget);
            return;
        }
    } else {
        fs.readdirSync('./').forEach(function(file) {
            singlePack(file);
        });
    }

    !total && warn('没有可以打包的组件！');
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
        error('读取kami配置文件失败。');
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
    if(newArr[1] > oldArr[1]) {
        return true;
    } else if(newArr[2] > oldArr[2]){
        if(newArr[1] == oldArr[1]) {
            return true;
        } else {
            return false;
        }
    } else if(newArr[3] > oldArr[3]) {
        if(newArr[1] == oldArr[1] && newArr[2] == oldArr[2]) {
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
    var file = fs.createWriteStream(file);
    var content = '{\n\t"scripts": {},\n\t"demo": {},\n\t"adapter": {}\n}';
    file.write(content);
    file.end();
    success('初始化成功，已创建'+kamiConfigFile);
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
    //optimist.describe('r', '源地址，默认: http://ued.qunar.com/kami-source/');

    //optimist.alias('h', 'history');
    //optimist.describe('h', 'kami组件的历史版本记录');

    optimist.alias('p', 'pack');
    optimist.describe('p', '组件打包【开发者使用】');

    optimist.describe('path', '指定路径,支持绝对和相对路径');

    optimist.describe('packall', '全部组件打包【开发者使用】');

    optimist.describe('qappinstall', 'qapp安装使用【开发者使用】');
    optimist.describe('qappadd', 'qapp添加kami组件【开发者使用】');
    optimist.describe('qappupdate', 'qapp更新kami组件【开发者使用】');
    optimist.describe('qappdel', 'qapp删除kami组件【开发者使用】');

    optimist.describe('detail', '详细帮助参见https://github.com/sprintsun/fekit-extension-kami');

    return optimist;
}

exports.run = function( options ){

    var root = options.cwd;
    var customPath = options.path;

    if(customPath) {
        root = customPath.charAt(0) == '/' ? customPath : path.join(root, customPath);
    }

    options.list = typeof options.l == "undefined" ? options.list : options.l;
    options.install = typeof options.i == "undefined" ? options.install : options.i;
    options.add = typeof options.a == "undefined" ? options.add : options.a;
    options.update = typeof options.u == "undefined" ? options.update : options.u;
    options.del = typeof options.d == "undefined" ? options.del : options.d;
    options.version = typeof options.v == "undefined" ? options.version : options.v;
    options.pack = typeof options.p == "undefined" ? options.pack : options.p;

    if(options.version) {
        showVersion();
    } else if(options.init) {
        init(root);
    } else if(options.local) {
        showLocalList(root);
    } else if(options.pack) {
        if(options.pack !== true) {
            var packRoot = options.path ? root : path.join(root, 'kami-source');
            pack(packRoot, options.pack);
        } else {
            warn('必须指定需要打包的组件名！例如fekit kami -p dialog');
        }
    } else if(options.packall) {
        var packRoot = options.path ? root : path.join(root, 'kami-source');
        pack(packRoot);
    } else if (options.del || options.qappdel) {
        kamiSource = options.del ? 'src/kami' : 'src/modules/scripts';
        options.qappdel && (options.del = options.qappdel);
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
        } else if (options.install || options.qappinstall) {
            kamiSource = options.install ? 'src/kami' : 'src/modules/scripts';
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
        } else if (options.add || options.qappadd) {
            kamiSource = options.add ? 'src/kami' : 'src/modules/scripts';
            options.qappadd && (options.add = options.qappadd);
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
        } else if (options.update || options.qappupdate) {
            kamiSource = options.update ? 'src/kami' : 'src/modules/scripts';
            options.qappupdate && (options.update = options.qappupdate);
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