/**
 * 创建 NSIS 安装器图片
 * - installerSidebar: 164x314 (左侧横幅)
 * - installerHeader: 150x57 (顶部横幅)
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function createInstallerImages() {
    const buildDir = path.join(__dirname, '../build');
    const iconPath = path.join(buildDir, 'icon-256.png');

    console.log('创建安装器图片...');

    // 侧边栏 SVG (164x314) - 紫蓝渐变背景 + logo
    const sidebarSvg = `
    <svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#667eea"/>
                <stop offset="100%" style="stop-color:#764ba2"/>
            </linearGradient>
        </defs>
        <rect width="164" height="314" fill="url(#bg)"/>
        <text x="82" y="280" font-family="Georgia, serif" font-size="20" font-weight="bold" fill="rgba(255,255,255,0.9)" text-anchor="middle">mditor</text>
    </svg>`;

    // 生成侧边栏背景
    const sidebarBg = await sharp(Buffer.from(sidebarSvg))
        .png()
        .toBuffer();

    // 读取 logo 并缩放
    const logo = await sharp(iconPath)
        .resize(100, 100, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();

    // 合成侧边栏
    await sharp(sidebarBg)
        .composite([{
            input: logo,
            left: 32,
            top: 90
        }])
        .toFile(path.join(buildDir, 'installerSidebar.png'));

    console.log('✓ installerSidebar.png (164x314)');

    // 头部横幅 SVG (150x57)
    const headerSvg = `
    <svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="hbg" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#667eea"/>
                <stop offset="100%" style="stop-color:#764ba2"/>
            </linearGradient>
        </defs>
        <rect width="150" height="57" fill="url(#hbg)"/>
    </svg>`;

    const headerBg = await sharp(Buffer.from(headerSvg))
        .png()
        .toBuffer();

    const headerLogo = await sharp(iconPath)
        .resize(40, 40, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();

    await sharp(headerBg)
        .composite([{
            input: headerLogo,
            left: 8,
            top: 8
        }])
        .toFile(path.join(buildDir, 'installerHeader.png'));

    console.log('✓ installerHeader.png (150x57)');

    // 转换为 BMP 格式 (NSIS 需要)
    // electron-builder 支持 PNG，会自动转换

    console.log('\n安装器图片创建完成！');
}

createInstallerImages().catch(err => {
    console.error('创建失败:', err);
    process.exit(1);
});
