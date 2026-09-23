import infantry from '../assets/units/v1/infantry.webp';
import armored from '../assets/units/v1/armored.webp';
import artillery from '../assets/units/v1/artillery.webp';
import fighter from '../assets/units/v1/fighter.webp';
import bomber from '../assets/units/v1/bomber.webp';

const images = {
    Infantry: infantry,
    Armored: armored,
    Artillery: artillery,
    Fighter: fighter,
    Bomber: bomber,
};
export const unitVisual = (type) => images[type] ?? null;
