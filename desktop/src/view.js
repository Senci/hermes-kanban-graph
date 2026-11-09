// The card view popover: how much a card shows. Choices are remembered like the toolbar's.
import { Button, Codicon, Popover, PopoverContent, PopoverTrigger, SegmentedControl, Switch, Tip, useValue } from '@hermes/plugin-sdk'
import { createElement as h } from 'react'

import { COLOR_BYS, DENSITIES, SUBTITLE_FIELDS } from './model.js'
import { $color, $density, $fields, setPref } from './state.js'

export function CardView() {
  const density = useValue($density), fields = useValue($fields), color = useValue($color)
  const toggleField = id => setPref('fields', SUBTITLE_FIELDS.map(f => f.id).filter(x => (x === id ? !fields.includes(x) : fields.includes(x))))
  return h(Popover, null,
    h(Tip, { label: 'Card view' }, h(PopoverTrigger, { asChild: true }, h(Button, { size: 'icon-xs', variant: 'ghost', 'aria-label': 'Card view' }, h(Codicon, { name: 'settings-gear' })))),
    h(PopoverContent, { align: 'end', className: 'kg-view' },
      h('div', { className: 'kg-view-row', role: 'group', 'aria-label': 'Density' },
        h('span', null, 'Density'),
        h(SegmentedControl, { options: DENSITIES, value: density, onChange: id => setPref('density', id) })),
      h('div', { className: 'kg-view-row', role: 'group', 'aria-label': 'Stripe color' },
        h('span', null, 'Stripe color'),
        h(SegmentedControl, { options: COLOR_BYS, value: color, onChange: id => setPref('color', id) })),
      h('div', { className: 'kg-view-sub', role: 'group', 'aria-label': 'Subtitle fields' },
        h('span', null, 'Subtitle shows'),
        ...SUBTITLE_FIELDS.map(f => h('label', { key: f.id, className: 'kg-view-row' },
          h('span', null, f.label),
          h(Switch, { size: 'xs', checked: fields.includes(f.id), disabled: density === 'compact', onCheckedChange: () => toggleField(f.id), 'aria-label': `Show ${f.label.toLowerCase()} in the subtitle` }))))))
}
