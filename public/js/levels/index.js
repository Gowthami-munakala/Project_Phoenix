// index.js — the book's pages. Add a level by importing its class and adding an entry.
import { HotelLevel } from './hotel.js';

export const LEVELS = [
  { id: 'hotel', index: 0, num: 'I', title: 'The Midnight Hotel — Room 009', art: 'hotel', glow: 'rgba(255,150,60,.6)', Level: HotelLevel,
    description: 'At 12:07 AM your car dies in a storm. The receptionist has been expecting you.',
    objective: 'Find the code, avoid the Occupant, escape before 1:00 AM.',
    atmosphere: 'Rain, flickering lamps, knocking at the door.' },
];
