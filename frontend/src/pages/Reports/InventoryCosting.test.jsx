import { describe, expect, it } from 'vitest';

import { buildGradeDashboardEntries } from './InventoryCosting';

describe('buildGradeDashboardEntries', () => {
  it('groups stock by grade identity and subtracts OUT quantity and value', () => {
    const cards = buildGradeDashboardEntries([
      {
        species: 'Vannamei',
        variety: 'HLSO',
        grade: '31/40',
        glaze: '20%',
        cargo_movement_type: 'IN',
        quantity: 100,
        inventory_value: 25000,
      },
      {
        species: 'Vannamei',
        variety: 'HLSO',
        grade: '31/40',
        glaze: '20%',
        cargo_movement_type: 'OUT',
        quantity: 35,
        inventory_value: -8750,
      },
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      grade: '31/40',
      inQty: 100,
      outQty: 35,
      outVal: 8750,
      balanceQty: 65,
      balanceValue: 16250,
      balanceAvg: 250,
    });
  });
});
