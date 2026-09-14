// Sugestão de cidade+UF enquanto o usuário digita no campo "Cidade" do
// modal de boas-vindas. A lista completa de municípios do Brasil vem de
// um JSON estático próprio (assets/data/br-cities.json, gerado a partir
// da API do IBGE) em vez de bater na API do IBGE toda vez — o arquivo
// nivelado (só "Nome|UF") tem uns 100KB, bem mais leve que os ~2.4MB da
// resposta completa da API, e fica em cache normal de navegador.

let citiesPromise = null;

function loadCities() {
  if (!citiesPromise) {
    citiesPromise = fetch("/assets/data/br-cities.json")
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => list.map((entry) => {
        const [name, uf] = entry.split("|");
        return { name, uf };
      }))
      .catch(() => []);
  }
  return citiesPromise;
}

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const MAX_RESULTS = 8;

export function mountCityAutocomplete(input) {
  if (!input || input.dataset.cityAcMounted) return;
  input.dataset.cityAcMounted = "1";
  input.setAttribute("autocomplete", "off");

  const wrap = document.createElement("div");
  wrap.className = "pg-city-ac";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const list = document.createElement("ul");
  list.className = "pg-city-ac-list";
  list.hidden = true;
  wrap.appendChild(list);

  let results = [];
  let activeIndex = -1;
  let debounceTimer = null;

  function close() {
    list.hidden = true;
    list.innerHTML = "";
    results = [];
    activeIndex = -1;
  }

  function selectResult(entry) {
    input.value = `${entry.name} - ${entry.uf}`;
    close();
  }

  function render() {
    list.innerHTML = results
      .map((entry, i) => `
        <li>
          <button type="button" class="pg-city-ac-option${i === activeIndex ? " active" : ""}" data-index="${i}">
            ${entry.name} <span class="pg-city-ac-uf">${entry.uf}</span>
          </button>
        </li>
      `)
      .join("");
    list.hidden = results.length === 0;
  }

  async function search(query) {
    const q = normalize(query);
    if (q.length < 2) {
      close();
      return;
    }
    const cities = await loadCities();
    const startsWith = [];
    const includes = [];
    for (const entry of cities) {
      const n = normalize(entry.name);
      if (n.startsWith(q)) startsWith.push(entry);
      else if (n.includes(q)) includes.push(entry);
      if (startsWith.length >= MAX_RESULTS) break;
    }
    results = startsWith.concat(includes).slice(0, MAX_RESULTS);
    activeIndex = -1;
    render();
  }

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => search(input.value), 120);
  });

  input.addEventListener("keydown", (e) => {
    if (list.hidden || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % results.length;
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + results.length) % results.length;
      render();
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectResult(results[activeIndex]);
    } else if (e.key === "Escape") {
      close();
    }
  });

  list.addEventListener("mousedown", (e) => {
    const btn = e.target.closest("[data-index]");
    if (!btn) return;
    e.preventDefault();
    selectResult(results[Number(btn.dataset.index)]);
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) close();
  });
}
