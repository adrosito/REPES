async function obtenerRankingEspana() {
    const response = await fetch("https://faceittracker.net/leaderboards/elo/es?page=1&limit=50");
    const text = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");

    const jugadores = Array.from(doc.querySelectorAll("table tbody tr")).map(row => {
        const columnas = row.querySelectorAll("td");
        const nickname = columnas[2]?.querySelector("a")?.innerText?.trim() || "Desconocido";
        const perfilURL = `https://faceittracker.net/players/${nickname}`;
        const elo = columnas[3]?.innerText?.trim().match(/\d+/)?.[0] || "N/A";

        return {
            posicionEspana: columnas[0]?.innerText?.trim().split(" ")[0],
            perfilURL,
            nickname,
            elo
        };
    }).filter(jugador => jugador.nickname !== "Desconocido" && jugador.elo !== "N/A");

    return jugadores;
}

async function actualizarClasificacion() {
    const jugadores = await obtenerRankingEspana();
    const tablaBody = document.querySelector("#tabla-clasificacion tbody");

    if (tablaBody && jugadores.length > 0) {
        tablaBody.innerHTML = "";

        jugadores.forEach((jugador) => {
            const fila = `
                <tr>
                    <td>${jugador.posicionEspana}</td>
                    <td><a href="${jugador.perfilURL}" target="_blank">${jugador.nickname}</a></td>
                    <td>${jugador.elo}</td>
                </tr>
            `;
            tablaBody.innerHTML += fila;
        });
    } else {
        tablaBody.innerHTML = "<tr><td colspan='3'>No se encontraron jugadores españoles.</td></tr>";
    }
}

actualizarClasificacion();
