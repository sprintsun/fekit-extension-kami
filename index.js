var fs = require('fs'),
    path = require('path'),
    request = require('request'),
    async = require('async'),
    colors = require('colors'),
    targz = require('tar.gz');

var BASE_URL = 'http://ued.qunar.com/kami-source/';
var kamiInfo = null;
var VERSION = '0.0.1';

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

// 满足commonJS的版本规范定义
function checkVersion(version) {
    return /^\d+\.\d+\.\d+$/.test(version);
}

function mkdirs(dirpath, callback) {
    fs.exists(dirpath, function(exists) {
        if(exists) {
            callback(dirpath);
        } else {
            mkdirs(path.dirname(dirpath), function(){
                fs.mkdir(dirpath, 0777, callback);
            });
        }
    });
};

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
    var url = BASE_URL + '/info.config';
    log('- 从服务器获取info.config ...');
    request(url, function(err, res, body) {
        if (!err && res.statusCode === 200) {
            try {
                kamiInfo = JSON.parse(body);
                cb(null);
            } catch (e) {
                error('info.config解析失败。');
            }
        } else {
            error('获取info.config失败。');
        }
    });
}

function installKami(taskList, widgets, root) {
    deleteFolderRecursive(path.join(root, './src/kami'));
    taskList.push(function(cb) {
        mkdirs(path.join(root, './src/kami'), function() {
            cb(null);
        })
    });
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

    var getLocalPath = function(version) {
        var primaryVersion = version.match(/(\d+)\..*/)[1];
        return path.join(root, './src/kami/', type, '/v' + primaryVersion);
    };

    // 判断该组件是否存在
    if(!kamiInfo) {
        cb('加载不到kami.config。');
        return;
    }
    if(!kamiInfo['widgets'] || !kamiInfo['widgets'][type]) {
        cb(type + ' 组件不存在。');
        return;
    }

    // 判断本地是否已存在该版本
    var widget = type + '@' + version;
    var localPath = getLocalPath(version);
    var widgetPath = path.join(localPath, widget);
    if(fs.existsSync(widgetPath)) {
        cb(widget + '已存在。', true);
        return;
    }

    var primaryVersion = version.match(/(\d+)\..*/)[1];
    // 创建目录
    mkdirs(localPath, function () {
        var url = BASE_URL + type + '/v' + primaryVersion + '/' + widget + '.map';
        log('下载 ' + url.replace('.map', '.tar.gz') + ' ...');
        request({
            url: url,
            encoding: null
        }, function (err, res, body) {
            if (!err && res.statusCode === 200) {
                var tmpPath = path.join(root, './tmp/' + widget + '.tar.gz');
                fs.writeFile(tmpPath, body, null, function () {
                    new targz().extract(
                        tmpPath,
                        localPath,
                        function (err) {
                            if (err) {
                                cb('解压 ' + tmpPath + ' 失败！');
                            } else {
                                cb(null, false, widgetPath, widget);
                            }
                        }
                    );
                });
            } else {
                cb('下载 ' + url + ' 失败！');
            }
        });
    })
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
        curr = 0;
    return function(cb) {
        version == "*" && (version = kamiInfo.widgets[type].version);
        var widget = type + '@' + version;
        log('开始安装 ' + widget + ' ...');
        total++;

        var callback = function(errMsg, exists, path, currWidget) {
            if(exists) {
                if(curr === 0) {
                    warn(errMsg);
                    cb(null);
                } else {
                    curr++;
                }
            } else if(errMsg) {
                error(errMsg);
                error('安装 ' + widget + ' 失败！');
                cb(null);
            } else {
                curr++;
                if(curr === 1) {
                    log('安装 ' + currWidget + ' 成功 ...');
                } else {
                    log('安装依赖 ' + currWidget + ' 成功 ...');
                }
                var widgets = getDependence(path);
                for(var type in widgets) {
                    total++;
                    addWidget(type, widgets[type], root, callback);
                }
                if(curr == total) {
                    success('安装 ' + widget + ' 成功 ...');
                    total = curr = 0;
                    cb(null);
                }
            }
        };

        addWidget(type, version, root, callback);
    }
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

    optimist.alias('i', 'install');
    optimist.describe('i', '根据kami.config加载组件');

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
    options.version = options.v;
    options.info = options.info;

    options.install = options.install;
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
    }

    if (options.install) {
        var widgets = [];
        for(var key in config.widgets) {
            widgets.push({name: key, version: config.widgets[key]});
        }
        installKami(taskList, widgets, root);
    }

    if (options.add) {
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
    }

    if(taskList.length == 1) {
        error('输入有误，请输入--help查看kami命令工具帮助');
        return;
    }

    if (!fs.existsSync(path.join(root, './tmp'))) {
        fs.mkdirSync(path.join(root, './tmp'));
    }

    async.series(taskList, function(err, results) {
        deleteFolderRecursive(path.join(root, './tmp'));
    });

}