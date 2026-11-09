// The card view popover: how much a card shows. Choices are remembered like the toolbar's.
import { Button, Codicon, Popover, PopoverContent, PopoverTrigger, SegmentedControl, Tip, useValue } from '@hermes/plugin-sdk'
import { createElement as h } from 'react'

import { DENSITIES } from './model.js'
import { $density, setPref } from './state.js'

export function CardView() {
  const density = useValue($density)
  return h(Popover, null,
    h(Tip, { label: 'Card view' }, h(PopoverTrigger, { asChild: true }, h(Button, { size: 'icon-xs', variant: 'ghost', 'aria-label': 'Card view' }, h(Codicon, { name: 'settings-gear' })))),
    h(PopoverContent, { align: 'end', className: 'kg-view' },
      h('div', { className: 'kg-view-row', role: 'group', 'aria-label': 'Density' },
        h('span', null, 'Density'),
        h(SegmentedControl, { options: DENSITIES, value: density, onChange: id => setPref('density', id) }))))
}
