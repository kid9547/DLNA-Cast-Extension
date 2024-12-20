const fs = require('fs-extra');
const archiver = require('archiver');
const path = require('path');

// 构建配置
const config = {
    sourceDir: './',
    outputDir: './dist',
    outputFile: 'chrome-dlna-cast.zip',
    // 需要打包的文件和目录
    includes: [
        'manifest.json',
        'background',
        'content',
        'popup',
        'lib',
        'icons'
    ]
};

async function build() {
    try {
        // 确保输出目录存在
        await fs.ensureDir(config.outputDir);

        // 创建zip文件流
        const output = fs.createWriteStream(path.join(config.outputDir, config.outputFile));
        const archive = archiver('zip', {
            zlib: { level: 9 } // 最大压缩级别
        });

        // 监听打包事件
        output.on('close', () => {
            console.log(`打包完成！文件大小: ${(archive.pointer() / 1024).toFixed(2)} KB`);
        });

        archive.on('error', (err) => {
            throw err;
        });

        // 将输出流管道连接到文件
        archive.pipe(output);

        // 添加文件到压缩包
        for (const item of config.includes) {
            const itemPath = path.join(config.sourceDir, item);
            const stats = await fs.stat(itemPath);

            if (stats.isDirectory()) {
                // 如果是目录，递归添加所有文件
                archive.directory(itemPath, item);
            } else {
                // 如果是文件，直接添加
                archive.file(itemPath, { name: item });
            }
        }

        // 完成打包
        await archive.finalize();

    } catch (error) {
        console.error('构建失败:', error);
        process.exit(1);
    }
}

// 执行构建
build(); 