import { Config } from '../../shared/types';
import { jsonSidecarStore } from './jsonStore';

type FavoritesFile = Record<string, unknown>;

const store = (config: Config) =>
  jsonSidecarStore<FavoritesFile>(config, {
    filename: 'favorites.json',
    fallback: () => ({}),
  });

function readField(config: Config, field: 'favorites' | 'order'): string[] {
  const v = store(config).read()[field];
  return Array.isArray(v) ? (v as string[]) : [];
}

function writeField(config: Config, field: 'favorites' | 'order', value: string[]): string[] {
  const io = store(config);
  io.write({ ...io.read(), [field]: value });
  return value;
}

export function readFavorites(config: Config): string[] {
  return readField(config, 'favorites');
}

export function writeFavorites(config: Config, favorites: string[]): string[] {
  return writeField(config, 'favorites', favorites);
}

export function readOrder(config: Config): string[] {
  return readField(config, 'order');
}

export function writeOrder(config: Config, order: string[]): string[] {
  return writeField(config, 'order', order);
}
