import { clearSession, getSession, setSession } from '../services/session.service.js';
import { formatRupiah } from '../utils/formatter.js';

const demoCategories = [
  { id: 'pulsa', name: 'Pulsa Reguler' },
  { id: 'data', name: 'Paket Data' },
  { id: 'pln', name: 'Token PLN' },
  { id: 'game', name: 'Top Up Game' },
  { id: 'ewallet', name: 'E-Wallet' }
];

const demoProducts = {
  pulsa: [
    { id: 'tsel10', name: 'Telkomsel 10.000', price: 11000 },
    { id: 'tsel20', name: 'Telkomsel 20.000', price: 21000 }
  ],
  data: [
    { id: 'data1', name: 'Axis 1GB 7 Hari', price: 9000 },
    { id: 'data2', name: 'Telkomsel 3GB 30 Hari', price: 35000 }
  ],
  pln: [
    { id: 'pln20', name: 'Token PLN 20.000', price: 21500 },
    { id: 'pln50', name: 'Token PLN 50.000', price: 51500 }
  ],
  game: [
    { id: 'ml86', name: 'Mobile Legends 86 Diamond', price: 21000 },
    { id: 'ff70', name: 'Free Fire 70 Diamond', price: 10000 }
  ],
  ewallet: [
    { id: 'dana10', name: 'DANA 10.000', price: 11000 },
    { id: 'gopay20', name: 'GoPay 20.000', price: 21000 }
  ]
};

export async function handleCommand(sock, remoteJid, text) {
  const lowerText = text.toLowerCase();
  const session = getSession(remoteJid);

  if (['menu', 'start', 'halo', 'hi'].includes(lowerText)) {
    setSession(remoteJid, {
      step: 'select_category',
      categories: demoCategories
    });

    await sock.sendMessage(remoteJid, {
      text: [
        '☁️ *Cloud Nest Store*',
        '',
        'Silakan pilih kategori:',
        '',
        ...demoCategories.map((category, index) => `${index + 1}. ${category.name}`),
        '',
        'Balas dengan nomor kategori.'
      ].join('\n')
    });
    return;
  }

  if (lowerText === 'batal' || lowerText === 'cancel') {
    clearSession(remoteJid);
    await sock.sendMessage(remoteJid, { text: 'Order dibatalkan. Ketik *menu* untuk mulai lagi.' });
    return;
  }

  if (session?.step === 'select_category') {
    const index = Number(text) - 1;
    const category = session.categories[index];

    if (!category) {
      await sock.sendMessage(remoteJid, { text: 'Nomor kategori tidak valid. Coba pilih lagi ya.' });
      return;
    }

    const products = demoProducts[category.id] || [];

    setSession(remoteJid, {
      step: 'select_product',
      category,
      products
    });

    await sock.sendMessage(remoteJid, {
      text: [
        `📦 *${category.name}*`,
        '',
        'Pilih produk:',
        '',
        ...products.map((product, idx) => `${idx + 1}. ${product.name} - ${formatRupiah(product.price)}`),
        '',
        'Balas dengan nomor produk, atau ketik *batal*.'
      ].join('\n')
    });
    return;
  }

  if (session?.step === 'select_product') {
    const index = Number(text) - 1;
    const product = session.products[index];

    if (!product) {
      await sock.sendMessage(remoteJid, { text: 'Nomor produk tidak valid. Coba pilih lagi ya.' });
      return;
    }

    setSession(remoteJid, {
      step: 'input_customer_id',
      product
    });

    await sock.sendMessage(remoteJid, {
      text: [
        `Produk: *${product.name}*`,
        `Harga: *${formatRupiah(product.price)}*`,
        '',
        'Kirim nomor tujuan / ID pelanggan.'
      ].join('\n')
    });
    return;
  }

  if (session?.step === 'input_customer_id') {
    const product = session.product;
    const customerId = text;

    clearSession(remoteJid);

    await sock.sendMessage(remoteJid, {
      text: [
        '✅ *Order diterima*',
        '',
        `Produk: ${product.name}`,
        `Harga: ${formatRupiah(product.price)}`,
        `Tujuan: ${customerId}`,
        '',
        'Order sedang diproses admin ya.'
      ].join('\n')
    });
    return;
  }

  await sock.sendMessage(remoteJid, {
    text: 'Ketik *menu* untuk mulai, atau *batal* untuk reset sesi.'
  });
}
