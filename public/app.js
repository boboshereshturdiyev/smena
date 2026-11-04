const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user'));

if (!token) {
    window.location.href = '/index.html';
}

// Bosh sahifa yuklanganda ishga tushadigan qism
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('user-status').innerText = `${user.username.toUpperCase()} (${user.role === 'superadmin' ? 'Superadmin' : user.smena_raqami + '-smena boshligʻi'})`;
    
    if(user.role === 'superadmin') {
        document.getElementById('superadmin-smena-select').classList.remove('hidden');
    }

    // Default sana qiymatlarini belgilash (Bugungi sana)
    const bugun = new Date().toISOString().split('T')[0];
    document.getElementById('sana').value = bugun;
    document.getElementById('filter-gacha').value = bugun;
    
    // 7 kun oldingi sanani boshlang'ich filtr qilish
    const ettiKunOldin = new Date();
    ettiKunOldin.setDate(ettiKunOldin.getDate() - 7);
    document.getElementById('filter-dan').value = ettiKunOldin.toISOString().split('T')[0];

    loadResurslar();
    loadReports();
});

let xodimlarKesh = [];
let yonalishlarKesh = [];
let hisobotKesh = [];

async function loadResurslar() {
    const res = await fetch('/api/resurslar', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    xodimlarKesh = data.xodimlar;
    yonalishlarKesh = data.yonalishlar;

    const xodimSelect = document.getElementById('xodim');
    xodimSelect.innerHTML = data.xodimlar.map(x => `<option value="${x.id}">${x.ism_familiya}</option>`).join('');

    const yonalishSelect = document.getElementById('yonalish');
    yonalishSelect.innerHTML = data.yonalishlar.map(y => `<option value="${y.id}">${y.nomi}</option>`).join('');
}

// TAQSIMOT FORMASINI SAQLASH
document.getElementById('taqsimot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const payload = {
        sana: document.getElementById('sana').value,
        xodim_id: document.getElementById('xodim').value,
        yonalish_id: document.getElementById('yonalish').value,
    };

    if(user.role === 'superadmin') {
        payload.smena_raqami = document.getElementById('smena_raqami').value;
    }

    const res = await fetch('/api/smena/taqsimot', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });

    if(res.ok) {
        alert('Taqsimot muvaffaqiyatli saqlandi/yangilandi!');
        loadReports();
    } else {
        const err = await res.json();
        alert(err.error || 'Xatolik yuz berdi');
    }
});

// HISOBOTLARNI YUKLASH
async function loadReports() {
    const dan = document.getElementById('filter-dan').value;
    const gacha = document.getElementById('filter-gacha').value;
    const smena = document.getElementById('filter-smena').value;

    let url = `/api/hisobot?bosh_sana=${dan}&tugash_sana=${gacha}`;
    if(smena) url += `&smena_raqami=${smena}`;

    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    hisobotKesh = data;

    const tbody = document.getElementById('hisobot-table-body');
    if(data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Ma'lumot topilmadi</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => {
        const sanaFormat = new Date(row.sana).toLocaleDateString('uz-UZ');
        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-3 font-medium">${sanaFormat}</td>
                <td class="p-3"><span class="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-md font-semibold">${row.smena_raqami}-Smena</span></td>
                <td class="p-3 font-semibold text-slate-900">${row.ism_familiya}</td>
                <td class="p-3"><span class="text-slate-600">${row.yonalish_nomi}</span></td>
                <td class="p-3 text-xs text-slate-400">${row.boshliq_nomi}</td>
            </tr>
        `;
    }).join('');
}

// EXCEL (CSV) EKSPORT FUNKSIYASI
function exportToCSV() {
    if(hisobotKesh.length === 0) return alert('Yuklab olish uchun ma\'lumot yo\'q');
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Sana,Smena,Xodim,Yonalish,Kiritgan Admin\n";
    
    hisobotKesh.forEach(row => {
        const sanaFormat = new Date(row.sana).toLocaleDateString('uz-UZ');
        csvContent += `"${sanaFormat}","${row.smena_raqami}-Smena","${row.ism_familiya}","${row.yonalish_nomi}","${row.boshliq_nomi}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Smena_Hisoboti_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function logout() {
    localStorage.clear();
    window.location.href = '/index.html';
}
