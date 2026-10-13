const fs = require('fs');
const f = 'C:/xlcab/xlcab_admin/src/features/payouts.test.tsx';
let s = fs.readFileSync(f, 'utf8');
const from = "    const card = (await screen.findByText(/Djamel Haddad/)).closest('li')!;\n    expect(within(card).getByText('Intervention requise')).toBeInTheDocument();";
if (!s.includes(from)) throw new Error('motif');
// Le nom figure deux fois (titre et libellé du bouton pour les lecteurs d'écran) : repère unique.
s = s.replace(from, "    const card = (await screen.findByText('Intervention requise')).closest('li')!;\n    expect(within(card).getByText(/Djamel Haddad ·/)).toBeInTheDocument();");
fs.writeFileSync(f, s);
console.log('ok');
