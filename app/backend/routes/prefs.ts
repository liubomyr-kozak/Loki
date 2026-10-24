import { Router } from 'express';
import { getConfig } from '../config/configState';
import { errorMessage } from '../errors';
import { readFavorites, writeFavorites, readOrder, writeOrder } from '../config/favoritesStore';

const router = Router();

router.get('/api/favorites', (req, res) => {
  try {
    res.json({ favorites: readFavorites(getConfig()) });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.put('/api/favorites', (req, res) => {
  try {
    const { favorites } = req.body ?? {};
    if (!Array.isArray(favorites)) {
      return res.status(400).json({ error: 'favorites must be an array' });
    }
    writeFavorites(getConfig(), favorites);
    res.json({ favorites });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.get('/api/order', (req, res) => {
  try {
    res.json({ order: readOrder(getConfig()) });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.put('/api/order', (req, res) => {
  try {
    const { order } = req.body ?? {};
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array' });
    }
    writeOrder(getConfig(), order);
    res.json({ order });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

export default router;
