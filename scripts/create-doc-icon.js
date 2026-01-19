/**
 * 创建文档图标
 * 文档样式 + "mditor" 文字标识
 * - 大图标（桌面）：文字在右下角
 * - 小图标（文件夹）：文字居中
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function createDocIcon() {
    const buildDir = path.join(__dirname, '../build');

    console.log('创建文档图标...');

    // 大图标 SVG：文字在右下角
    const docSvgLarge = `
    <svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="docGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#f8f9fa"/>
                <stop offset="100%" style="stop-color:#e9ecef"/>
            </linearGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.15"/>
            </filter>
        </defs>

        <!-- 文档主体 -->
        <path d="M 48 16
                 L 160 16
                 L 208 64
                 L 208 240
                 Q 208 248 200 248
                 L 56 248
                 Q 48 248 48 240
                 Z"
              fill="url(#docGrad)"
              stroke="#dee2e6"
              stroke-width="1"
              filter="url(#shadow)"/>

        <!-- 折角 -->
        <path d="M 160 16 L 160 64 L 208 64 Z"
              fill="#dee2e6"/>
        <path d="M 160 16 L 208 64 L 160 64 Z"
              fill="none"
              stroke="#ced4da"
              stroke-width="1"/>

        <!-- 文本行装饰 -->
        <rect x="72" y="88" width="112" height="6" rx="3" fill="#adb5bd"/>
        <rect x="72" y="108" width="96" height="6" rx="3" fill="#ced4da"/>
        <rect x="72" y="128" width="104" height="6" rx="3" fill="#ced4da"/>

        <!-- mditor 文字（右下角） -->
        <text x="188" y="220"
              font-family="Inter, -apple-system, sans-serif"
              font-size="28"
              font-weight="600"
              fill="#6c757d"
              text-anchor="end">mditor</text>
    </svg>`;

    // 小图标 SVG：文字居中
    const docSvgSmall = `
    <svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="docGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#f8f9fa"/>
                <stop offset="100%" style="stop-color:#e9ecef"/>
            </linearGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.15"/>
            </filter>
        </defs>

        <!-- 文档主体 -->
        <path d="M 48 16
                 L 160 16
                 L 208 64
                 L 208 240
                 Q 208 248 200 248
                 L 56 248
                 Q 48 248 48 240
                 Z"
              fill="url(#docGrad)"
              stroke="#dee2e6"
              stroke-width="1"
              filter="url(#shadow)"/>

        <!-- 折角 -->
        <path d="M 160 16 L 160 64 L 208 64 Z"
              fill="#dee2e6"/>
        <path d="M 160 16 L 208 64 L 160 64 Z"
              fill="none"
              stroke="#ced4da"
              stroke-width="1"/>

        <!-- mditor 文字（居中） -->
        <text x="128" y="155"
              font-family="Inter, -apple-system, sans-serif"
              font-size="36"
              font-weight="700"
              fill="#495057"
              text-anchor="middle">mditor</text>
    </svg>`;

    // 生成大图标基础图（用于 64, 128, 256, 1024）
    const docBufferLarge = await sharp(Buffer.from(docSvgLarge))
        .resize(256, 256)
        .png()
        .toBuffer();

    // 生成小图标基础图（用于 16, 24, 32, 48）
    const docBufferSmall = await sharp(Buffer.from(docSvgSmall))
        .resize(256, 256)
        .png()
        .toBuffer();

    // 生成各种尺寸
    const smallSizes = [16, 24, 32, 48];
    const largeSizes = [64, 128, 256];

    // 小图标：文字居中
    for (const size of smallSizes) {
        await sharp(docBufferSmall)
            .resize(size, size, { kernel: sharp.kernel.lanczos3 })
            .png()
            .toFile(path.join(buildDir, `doc-${size}.png`));
        console.log(`✓ doc-${size}.png (小图标)`);
    }

    // 大图标：文字右下角
    for (const size of largeSizes) {
        await sharp(docBufferLarge)
            .resize(size, size, { kernel: sharp.kernel.lanczos3 })
            .png()
            .toFile(path.join(buildDir, `doc-${size}.png`));
        console.log(`✓ doc-${size}.png (大图标)`);
    }

    // 生成 1024 用于 ICO
    await sharp(docBufferLarge)
        .resize(1024, 1024, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toFile(path.join(buildDir, 'doc-1024.png'));
    console.log('✓ doc-1024.png');

    // 生成 ICO
    const iconGen = require('icon-gen');
    await iconGen(path.join(buildDir, 'doc-1024.png'), buildDir, {
        report: false,
        ico: {
            name: 'doc',
            sizes: [16, 24, 32, 48, 64, 128, 256]
        }
    });

    console.log('✓ doc.ico (文档图标)');
    console.log('\n文档图标创建完成！');
}

createDocIcon().catch(err => {
    console.error('创建失败:', err);
    process.exit(1);
});
