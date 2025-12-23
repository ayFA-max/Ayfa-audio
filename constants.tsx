
import { Book } from './types';

export const MOCK_BOOKS: Book[] = [
  {
    id: '1',
    title: 'The Midnight Library',
    author: 'Matt Haig',
    description: 'Between life and death there is a library, and within that library, the shelves go on forever.',
    coverUrl: 'https://picsum.photos/seed/midnight/400/600',
    category: 'Fiction',
    duration: '9h 12m',
    rating: 4.8
  },
  {
    id: '2',
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    description: 'A lone astronaut must save the earth from disaster.',
    coverUrl: 'https://picsum.photos/seed/hailmary/400/600',
    category: 'Sci-Fi',
    duration: '12h 30m',
    rating: 4.9
  },
  {
    id: '3',
    title: 'Atomic Habits',
    author: 'James Clear',
    description: 'An easy & proven way to build good habits & break bad ones.',
    coverUrl: 'https://picsum.photos/seed/habits/400/600',
    category: 'Self-Help',
    duration: '5h 35m',
    rating: 4.7
  },
  {
    id: '4',
    title: 'Dune',
    author: 'Frank Herbert',
    description: 'A desert planet, a spice that extends life, and a battle for the universe.',
    coverUrl: 'https://picsum.photos/seed/dune/400/600',
    category: 'Classic Sci-Fi',
    duration: '21h 05m',
    rating: 4.6
  }
];

export const CATEGORIES = ['All', 'Fiction', 'Sci-Fi', 'Non-Fiction', 'History', 'Self-Help', 'AI Generated'];
