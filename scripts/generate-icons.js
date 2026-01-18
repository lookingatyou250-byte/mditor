/**
 * 图标生成脚本
 * 使用 icon-gen 生成 ICO/ICNS
 */

const fs = require('fs');
const path = require('path');
const iconGen = require('icon-gen');

async function generateIcons() {
    const buildDir = path.join(__dirname, '../build');
    const sourcePng = path.join(buildDir, 'icon-1024.png');

    if (!fs.existsSync(sourcePng)) {
        console.log('请先运行: node scripts/process-icon.js');
        process.exit(1);
    }

    console.log('生成图标...');

    try {
        await iconGen(sourcePng, buildDir, {
            report: true,
            ico: {
                name: 'icon',
                sizes: [16, 24, 32, 48, 64, 128, 256]
            },
            icns: {
                name: 'icon',
                sizes: [16, 32, 64, 128, 256, 512, 1024]
            }
        });

        console.log('\n✓ 图标生成完成！');
    } catch (err) {
        console.error('生成失败:', err.message);
        process.exit(1);
    }
}

generateIcons();
