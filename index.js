var fs = require('fs'),
    path = require('path'),
    extend = require('extend'),
    request = require('request'),
    async = require('async'),
    targz = require('tar.gz'),
    cpr = require('cpr').cpr,
    colors = require('colors'),
    spawn = require('child_process').spawn;

var BASE_URL = 'http://ued.qunar.com/kami-source/';
var kamiInfo = null;

var isWin32 = process.platform === "win32";
log = console.info;

function fixCmd(cmd) {
    return isWin32 ? cmd + '.cmd' : cmd;
}

function getWidgetAliasName(name) {
    return name.replace(/\w/, function(a) {
        return a.toUpperCase();
    }) + 'Widget';
}

function deleteFolderRecursive(path) {
    var files = [];
    if (fs.existsSync(path)) {
        files = fs.readdirSync(path);
        files.forEach(function(file, index) {
            var curPath = path + "/" + file;
            if (fs.statSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
}

function mkdirs(dirpath, callback) {
    fs.exists(dirpath, function(exists) {
        if(exists) {
            callback(dirpath);
        } else {
            mkdirs(path.dirname(dirpath), 0777, function(){
                fs.mkdir(dirpath, 0777, callback);
            });
        }
    });
};

function showList(config) {
    return function(cb) {
        var url = BASE_URL + '/info.config';
        log('- 获取kami组件列表 ...');
        request(url, function(err, res, body) {
            if (!err && res.statusCode === 200) {
                var info = {};
                try {
                    info = JSON.parse(body);
                } catch (e) {
                    log(' * [ERROR]信息内容解析失败。'.red);
                }
                if (info.list && info.list.length) {
                    info.list.forEach(function(item) {
                        log(item.name + '\t' + item.version + '\t' + item.description);
                    });
                }
            } else {
                log(' * [ERROR]获取列表信息失败。'.red);
            }
            cb(null);
        });
    };
}

function getKamiInfo() {
    var url = BASE_URL + '/info.config';
    log('- 从服务器获取info.config ...');
    request(url, function(err, res, body) {
        if (!err && res.statusCode === 200) {
            try {
                kamiInfo = JSON.parse(body);
            } catch (e) {
                log(' * [ERROR]信息内容解析失败。'.red);
            }
        } else {
            log(' * [ERROR]获取info.config失败。'.red);
        }
    });
}

function installKami(config, widgets, root) {

    return function(cb) {
        deleteFolderRecursive(path.join('./src/kami'));
        mkdirs('./src/kami', function() {
            widgets.forEach(function(widget) {
                addKami(widget.name, widget.version, root)
            });
        })
    };
}

function addKami(type, version, root) {

    var taskList = [];

    var getLocalPath = function(version) {
        var primaryVersion = version.match(/(\d+)\..*/);
        return path.join(root, './src/kami/', type, '/v' + primaryVersion);
    };
    var getFileName = function(version) {
        return type + '-' + version + '.js';
    }

    // 判断本地是否已存在该版本
    if(version) {
        var localPath = path.join(getLocalPath(version), getFileName(version));
        if(fs.existsSync(localPath)) {
            log(' * [ERROR] ' + type + '-' + version + '已存在。'.red);
            return;
        }
    } else {
        // 从服务器获取组件最新版本号
        !kamiInfo && taskList.push(getKamiInfo);
    }

    // 判断该组件是否存在
    taskList.push(function() {
        if(!kamiInfo['widgets'] || kamiInfo['widgets'][type]) {
            log(' * [ERROR] ' + type + ' 组件不存在。'.red);
            return;
        }
        version = kamiInfo['widgets'][type].version;
        var primaryVersion = version.match(/(\d+)\..*/);
        // 创建目录
        mkdirs(getLocalPath(version), function() {
            log(' * 开始下载 ' + type + ' 组件包，版本 ' + version + ' ...');
            var url = BASE_URL + 'widgets/' + type + '/v' + primaryVersion + '/' + type + '-' + version +  '.map';
            log(' * 下载地址: ' + url.replace('.map', '.tar.gz'));
            request({
                url: url,
                encoding: null
            }, function(err, res, body) {
                if (!err && res.statusCode === 200) {
                    log(' * 下载文件成功。');
                    fs.writeFileSync(path.join(root, './tmp/' + type + '-' + version + '.tar.gz'), body);
                    new targz().extract(
                        path.join(root, './tmp/' + type + '-' + version + '.tar.gz'),
                        path.join(root, './src/kami/', type, '/v' + primaryVersion),
                        function(err) {
                            if (err) {
                                log(' * [ERROR]安装 ' + type + ' 组件失败。'.red);
                            } else {
                                fs.renameSync(path.join(root, './src/widgets/src'), path.join(root, './src/widgets/' + type));
                                log(' * 安装 ' + type + ' 组件 V' + version + '版本成功。'.green);
                            }
                        }
                    );
                } else {
                    log(' * 下载文件失败。');
                    log(' * 安装 ' + type + ' 组件失败。'.red);
                }
            });
        });
    });

    async.series(taskList, function(err, results) {});
}

function showWidgetInfo(config, name, root) {
    return function(cb) {
        log('');
        log('- 显示' + name + '组件信息 ...');
        var widgetConfig = {};
        try {
            widgetConfig = JSON.parse(fs.readFileSync(path.join(root, 'src', name, 'widget.config')));
            log(' * 组件组名: ' + (widgetConfig.name || ''));
            log(' * 描述: ' + (widgetConfig.description || '无'));
            log(' * 版本: ' + (widgetConfig.version || '未知'));
            log(' * 更新时间: ' + (widgetConfig.update_time || '未知'));
            log(' * 输出: ');
            widgetConfig.exports.forEach(function(item, index) {
                log('  * -- ' + (index + 1) + ' --');
                log('  * 名称: ' + item.name + ' \t描述名: ' + (item.description || '无') + ' \t包含组件: ' + item.widgets.join(', '));
                log('  * 脚本: ' + ((item.script && item.script.replace('./exports', getWidgetAliasName(name))) || '无') + ' \t样式: ' + ((item.style && item.style.replace('./exports', getWidgetAliasName(name))) || '无'));
                log('  * 备注: ' + (item.mark || '无'));
            });
            cb(null);
        } catch(e) {
            log(' * [ERROR]读取组件配置文件失败！'.red);
            cb(null);
        }
    };
}

exports.usage = "kami构建工具"

exports.set_options = function( optimist ){
    optimist.alias('l', 'list');
    optimist.describe('l', '查看kami所提供的组件列表');

    optimist.alias('v', 'version');
    optimist.describe('v', '查看kami构建工具版本号');

    optimist.alias('r', 'remote');
    optimist.describe('r', '源地址，默认: http://ued.qunar.com/kami-source/');

    optimist.alias('install', 'install');
    optimist.describe('install', '根据"kami.config" || "fekit.config-kami节点"加载组件');

    optimist.alias('a', 'add');
    optimist.describe('a', '添加kami组件');

    optimist.alias('d', 'del');
    optimist.describe('d', '移除kami组件');

    optimist.alias('h', 'help');
    optimist.describe('h', 'kami命令帮助');

    optimist.alias('hi', 'history');
    optimist.describe('hi', 'kami组件的历史版本记录');

    return optimist;
}

exports.run = function( options ){

    // 安装目录，不与node_modules同级

    // 1. fekit install kami

    // 2. fekit kami install   kami.config || fekit.config-kami节点

    // 3. fekit kami add dialog@v0.0.1h
    // 3. fekit kami update dialog
    // 3. fekit kami delete dialog

    // 4. fekit kami history dialog

    var root = options.cwd,
        taskList = [];

    options.list = options.l;
    options.remote = options.r;
    options.add = options.a;

    var config = {};
    try {
        var existsKami = fs.existsSync(path.join(root, './src/kami.config'));
        if(existsKami) { // 优先读取kami.config
            config = JSON.parse(fs.readFileSync(path.join(root, './src/kami.config')));
        } else { // 读取fekit.config的kami节点
            var fekitConfig = JSON.parse(fs.readFileSync(path.join(root, 'fekit.config')));
            config = fekitConfig['kami'];
        }
    } catch (e) {
        log(' * [ERROR]读取kami配置文件失败。'.red);
    }

    if (options.remote && options.remote !== true) {
        BASE_URL = options.remote;
    }

    if (options.list) {
        taskList.push(showList(config));
    }

    if (options.install) {
        var widgets = [];
        for(var key in config) {
            widgets.push({name: key, version: config[key]});
        }
        taskList.push(installKami(config, widgets, root));
        widgets.forEach(function(widget) {
            taskList.push(showWidgetInfo(config, widget.name, root));
        });
    }

    if (options.add) {
        var index = options.add.indexOf('v@');
        if(~index) {
            var type = options.add.substring(0, index),
                version = options.add.substring(index);
            taskList.push(addKami(type, version, root));
        } else {
            taskList.push(addKami(options.add, null, root));
        }
    }

    if (!fs.existsSync(path.join(root, './tmp'))) {
        fs.mkdirSync(path.join(root, './tmp'));
    }

    async.series(taskList, function(err, results) {
        deleteFolderRecursive(path.join(root, './tmp'));
        log('-------------------------');
        log('- Love & Enjoy it!'.green);
    });
}