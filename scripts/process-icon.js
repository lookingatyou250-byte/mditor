/**
 * 图标处理脚本
 * 裁剪并生成高质量图标
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function processIcon() {
    const inputPath = path.join(__dirname, '../assets/icon.png');
    const outputDir = path.join(__dirname, '../build');

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('处理图标中...');

    // 读取原图并统一转为 1024x1024 带透明通道的圆角 PNG（消除原图 JPEG 四角实心白边）
    const rawBuffer = fs.readFileSync(inputPath);
    const metadata = await sharp(rawBuffer).metadata();
    console.log(`原图格式: ${metadata.format}, 尺寸: ${metadata.width}x${metadata.height}, hasAlpha: ${metadata.hasAlpha}`);

    const masterSize = 1024;
    const cornerRadius = 244;
    const roundedMask = Buffer.from(
        `<svg width="${masterSize}" height="${masterSize}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="${masterSize}" height="${masterSize}" rx="${cornerRadius}" ry="${cornerRadius}" fill="#ffffff"/>
        </svg>`
    );

    const masterPngBuffer = await sharp(rawBuffer)
        .resize(masterSize, masterSize, {
            kernel: sharp.kernel.lanczos3,
            fit: 'cover'
        })
        .ensureAlpha()
        .composite([{
            input: roundedMask,
            blend: 'dest-in'
        }])
        .png({ quality: 100, compressionLevel: 9 })
        .toBuffer();

    // 同步写回 assets/icon.png（保证 Electron 窗口 / 任务栏图标也是真正带透明圆角的 PNG）
    fs.writeFileSync(inputPath, masterPngBuffer);
    console.log('✓ 更新 assets/icon.png 为透明圆角 RGBA PNG');

    // 生成各种尺寸的 PNG (用于 ICO)
    const sizes = [16, 24, 32, 48, 64, 128, 256, 512];

    for (const size of sizes) {
        const outputPath = path.join(outputDir, `icon-${size}.png`);
        await sharp(masterPngBuffer)
            .resize(size, size, {
                kernel: sharp.kernel.lanczos3,  // 高质量缩放算法
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png({ quality: 100, compressionLevel: 9 })
            .toFile(outputPath);
        console.log(`✓ 生成 ${size}x${size}`);
    }

    // 生成 1024x1024 高清版本
    fs.writeFileSync(path.join(outputDir, 'icon-1024.png'), masterPngBuffer);
    console.log('✓ 生成 1024x1024 高清版');

    // 生成圆形版本 (macOS 风格)
    const circleSize = 512;
    const circleBuffer = Buffer.from(
        `<svg width="${circleSize}" height="${circleSize}">
            <circle cx="${circleSize/2}" cy="${circleSize/2}" r="${circleSize/2}" fill="white"/>
        </svg>`
    );

    await sharp(masterPngBuffer)
        .resize(circleSize, circleSize, { kernel: sharp.kernel.lanczos3 })
        .composite([{
            input: circleBuffer,
            blend: 'dest-in'
        }])
        .png()
        .toFile(path.join(outputDir, 'icon-circle.png'));
    console.log('✓ 生成圆形图标');

    console.log('\n图标处理完成！');
    console.log('下一步: 运行 node scripts/generate-icons.js 生成 ICO/ICNS');
}

processIcon().catch(err => {
    console.error('处理失败:', err);
    process.exit(1);
});
