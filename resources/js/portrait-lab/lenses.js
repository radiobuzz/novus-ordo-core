// Lens contours measured on the original front-frame sheet. Material rendering
// is separate from frame artwork, so clear v3 portraits keep identical pixels.
export const originalLensPaths = {
    'round-v1':
        'M 269 420 A 101 99 0 1 1 67 420 A 101 99 0 1 1 269 420 Z M 563 420 A 100 99 0 1 1 363 420 A 100 99 0 1 1 563 420 Z',
    'rectangular-v1':
        'M 701 377 C 723 351 870 350 891 379 C 910 406 892 477 865 492 C 840 506 746 506 718 489 C 696 475 684 402 701 377 Z M 990 381 C 1010 350 1160 350 1181 375 C 1200 405 1190 477 1170 491 C 1144 506 1043 508 1018 492 C 994 475 971 411 990 381 Z',
    'aviator-v1':
        'M 73 811 C 111 778 220 774 266 810 C 301 840 269 914 210 954 C 153 993 96 980 71 944 C 47 910 45 843 73 811 Z M 363 811 C 402 777 511 780 548 816 C 580 849 578 913 554 947 C 521 990 464 989 407 951 C 354 914 331 841 363 811 Z',
    'rimless-v1':
        'M 692 837 C 725 823 849 823 879 841 C 899 859 883 932 865 948 C 842 962 718 962 696 946 C 679 931 673 856 692 837 Z M 1003 838 C 1030 823 1162 824 1187 839 C 1206 855 1197 934 1181 946 C 1162 961 1038 962 1014 947 C 994 930 984 856 1003 838 Z',
};

export function drawLenses(context, asset, settings) {
    if (!settings || settings.finish === 'clear' || !asset.lensPath) return;
    const [sx, sy, sw, sh] = asset.source;
    const [x, y, w, h] = asset.target;
    context.save();
    context.translate(x, y);
    context.scale(w / sw, h / sh);
    context.translate(-sx, -sy);
    context.clip(new Path2D(asset.lensPath));
    if (settings.finish === 'mirror') {
        const gradient = context.createLinearGradient(sx, sy, sx + sw * 0.3, sy + sh);
        gradient.addColorStop(0, '#edf6fb');
        gradient.addColorStop(0.35, settings.color);
        gradient.addColorStop(0.48, '#e5eff5');
        gradient.addColorStop(0.54, '#536471');
        gradient.addColorStop(1, '#172632');
        context.fillStyle = gradient;
    } else {
        context.globalAlpha = settings.finish === 'black' ? 0.94 : 0.48;
        context.fillStyle = settings.finish === 'black' ? '#0b1015' : settings.color;
    }
    context.fillRect(sx, sy, sw, sh);
    context.restore();
}
