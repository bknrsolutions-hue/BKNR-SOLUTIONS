// ============================================================
// BKNR ERP — useDropdowns hook
// Shared data fetcher for all operation screens
// ============================================================

import { useState, useEffect } from 'react';
import { BASE_URL } from '../config';

export function useDropdowns() {
  const [dropdowns, setDropdowns] = useState({
    companies: [],
    locations: [],
    suppliers: [],
    contractors: [],
    varieties: [],
    grades: [],
    freezers: [],
    packing_styles: [],
    vehicles: [],
  });
  const [liveBatches, setLiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDropdowns = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/mobile/form_dropdowns`, { credentials: 'include' });
      const json = await res.json();
      if (json.status === 'success') setDropdowns(json.data);
    } catch (e) {
      console.warn('Dropdown fetch failed:', e);
    }
  };

  const fetchLiveBatches = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/mobile/live_stock_batches`, { credentials: 'include' });
      const json = await res.json();
      if (json.status === 'success') setLiveBatches(json.data);
    } catch (e) {
      console.warn('Live batches fetch failed:', e);
    }
  };

  const fetchContractorRate = async (contractor, variety = 'HOSO') => {
    try {
      const res = await fetch(
        `${BASE_URL}/api/mobile/contractor_rate?contractor=${encodeURIComponent(contractor)}&variety=${variety}`,
        { credentials: 'include' }
      );
      const json = await res.json();
      return json.rate?.toString() || '0';
    } catch (e) {
      return '0';
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchDropdowns(), fetchLiveBatches()]);
      setLoading(false);
    };
    init();
  }, []);

  const refresh = () => {
    fetchDropdowns();
    fetchLiveBatches();
  };

  return { dropdowns, liveBatches, loading, refresh, fetchContractorRate };
}
