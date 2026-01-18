/**
 * 创建文档图标
 * 文档样式 + 右下角 m 标志（用于 .md 文件关联）
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function createDocIcon() {
    const buildDir = path.join(__dirname, '../build');
    const badgeIcon = path.join(buildDir, 'icon-128.png');

    console.log('创建文档图标...');

    // 文档 SVG 模板 (类似 Word/TXT 文件图标)
    const docSvg = `
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
        <rect x="72" y="96" width="112" height="8" rx="4" fill="#adb5bd"/>
        <rect x="72" y="120" width="96" height="8" rx="4" fill="#ced4da"/>
        <rect x="72" y="144" width="104" height="8" rx="4" fill="#ced4da"/>
    </svg>`;

    // 生成文档基础图
    const docBuffer = await sharp(Buffer.from(docSvg))
        .resize(256, 256)
        .png()
        .toBuffer();

    // 读取 m 图标作为徽章
    const badge = await sharp(badgeIcon)
        .resize(80, 80)  // 徽章大小
        .png()
        .toBuffer();

    // 合成：文档 + 右下角徽章
    const sizes = [16, 24, 32, 48, 64, 128, 256];

    for (const size of sizes) {
        const badgeSize = Math.max(Math.round(size * 0.35), 8);
        const badgeOffset = Math.round(size * 0.02);

        // 缩放文档
        const doc = await sharp(docBuffer)
            .resize(size, size, { kernel: sharp.kernel.lanczos3 })
            .png()
            .toBuffer();

        // 缩放徽章
        const smallBadge = await sharp(badge)
            .resize(badgeSize, badgeSize, { kernel: sharp.kernel.lanczos3 })
            .png()
            .toBuffer();

        // 合成
        await sharp(doc)
            .composite([{
                input: smallBadge,
                left: size - badgeSize - badgeOffset,
                top: size - badgeSize - badgeOffset
            }])
            .png()
            .toFile(path.join(buildDir, `doc-${size}.png`));

        console.log(`✓ doc-${size}.png`);
    }

    // 生成 ICO
    const iconGen = require('icon-gen');

    // 先生成一个大的合成图用于 icon-gen
    const bigDoc = await sharp(docBuffer)
        .resize(1024, 1024, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();

    const bigBadge = await sharp(badge)
        .resize(360, 360, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();

    await sharp(bigDoc)
        .composite([{
            input: bigBadge,
            left: 640,
            top: 640
        }])
        .png()
        .toFile(path.join(buildDir, 'doc-1024.png'));

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
