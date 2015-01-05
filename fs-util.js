/**
 * Created by jiuhu on 15/1/5.
 */
var fs = require('fs');
var path = require('path');

function rmDirSync(path) {
    var files = [];
    if (fs.existsSync(path)) {
        files = fs.readdirSync(path);
        files.forEach(function(file, index) {
            var curPath = path + "/" + file;
            if (fs.statSync(curPath).isDirectory()) { // recurse
                rmDirSync(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
}

function mkDirSync(dirpath, mode) {
    if (mode === undefined) {
        mode = 0755 & (~process.umask());
    }
    var tPath = dirpath, paths = [];
    while (!fs.existsSync(tPath)) {
        paths.unshift(tPath);
        tPath = path.dirname(tPath);
    }
    paths.forEach(function (t) {
        fs.mkdirSync(t, mode);
    })
}

function mkDir(dirpath, callback) {
    fs.exists(dirpath, function(exists) {
        if(exists) {
            callback(dirpath);
        } else {
            mkDir(path.dirname(dirpath), function(){
                fs.mkdir(dirpath, 0777, callback);
            });
        }
    });
};

function copySync(source, dest) {
    if(isFileSync(source)) {
        copyFileSync(source, dest);
    } else if(isDirectorySync(source)) {
        copyDirSync(source, dest);
    }
}

function copyDirSync(source, dest) {
    mkDirSync(dest);
    var tSrc, tDst;
    listSync(source).forEach(function (file) {
        tSrc = path.join(source, file),
            tDst = path.join(dest, file);
        if (isDirectorySync(tSrc)) {
            copyDirSync(tSrc, tDst);
        } else {
            copyFileSync(tSrc, dest);
        }
    })
}

var buffSize = 64 * 1024, //64K
    buff = new Buffer(buffSize);
function copyFileSync(srcFile, destDir) {
    var destFile = path.join(destDir, path.basename(srcFile)),
        readable = fs.openSync(srcFile, 'r'),
        writable = fs.openSync(destFile, 'w'),
        readSize, pos = 0;

    while ((readSize = fs.readSync(readable, buff, 0, buffSize, pos)) > 0) {
        fs.writeSync(writable, buff, 0, readSize);
        pos += readSize;
    }
    fs.closeSync(readable);
    fs.closeSync(writable);
}

function listSync(dir) {
    if (isDirectorySync(dir)) {
        return fs.readdirSync(dir);
    }
    return [];
}

function createFileSync(file) {
    mkDirSync(path.dirname(file));
    fs.closeSync(fs.openSync(file, 'w'));
}

function isDirectorySync(file) {
    return fs.lstatSync(file).isDirectory();
}

function isFileSync(file) {
    return fs.lstatSync(file).isFile();
}

module.exports = {
    rmDirSync: rmDirSync,
    mkDirSync: mkDirSync,
    mkDir: mkDir,
    copySync: copySync,
    copyDirSync: copyDirSync,
    copyFileSync: copyFileSync,
    listSync: listSync,
    isDirectorySync: isDirectorySync,
    isFileSync: isFileSync,
    createFileSync: createFileSync
};