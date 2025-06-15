const API_KEY = "df0b72fb-f56d-460b-a631-4b9e2063c32c";
const API_URL = "https://open.faceit.com/data/v4/rankings/games/cs2/regions/EU?limit=100";

//Función para obtener el ranking general (solo los primeros 50)
async function obtenerRanking() {
    try {
        const response = await fetch(API_URL, {
            headers: { "Authorization": `Bearer ${API_KEY}` }
        });

        if (!response.ok) throw new Error(`Error en la API: ${response.status}`);

        const data = await response.json();
        return data.items.slice(0, 100); // 📌 Solo los primeros 50 jugadores

    } catch (error) {
        console.error("Error al obtener el ranking:", error);
        return [];
    }
}

//Función para obtener detalles de cada jugador
async function obtenerDatosJugador(player_id) {
    try {
        const response = await fetch(`https://open.faceit.com/data/v4/players/${player_id}`, {
            headers: { "Authorization": `Bearer ${API_KEY}` }
        });

        if (!response.ok) throw new Error(`Error en la API: ${response.status}`);

        const data = await response.json();
        return {
            nickname: data.nickname,
            elo: data.games.cs2.faceit_elo,
            avatar: data.avatar || "https://via.placeholder.com/40", // 📌 Si no tiene avatar, usar una imagen por defecto
            country: data.country,
            region: data.games.cs2.region.replace("EU", "").trim() // 📌 Elimina "EU" y limpia espacios innecesarios
        };

    } catch (error) {
        console.error(`Error al obtener datos del jugador ${player_id}:`, error);
        return { nickname: "Desconocido", elo: "N/A", avatar: "https://via.placeholder.com/40", country: "N/A", region: "N/A" };
    }
}

//Función para actualizar la tabla en `clasificacion.html`
async function actualizarClasificacion() {
    const jugadores = await obtenerRanking();
    const tablaBody = document.querySelector("#tabla-clasificacion tbody");

    if (tablaBody && jugadores.length > 0) {
        tablaBody.innerHTML = ""; // Limpia la tabla antes de actualizar

        for (let i = 0; i < jugadores.length; i++) {
            const jugador = jugadores[i];
            const datos = await obtenerDatosJugador(jugador.player_id);
            const banderaUrl = `https://flagcdn.com/w40/${datos.country.toLowerCase()}.png`;

            const posicion = `${i + 1}º`; // 📌 Posición: "1º", "2º", "3º", etc.

            const fila = `
                <tr>
                    <td>${posicion}</td>
                    <td><img src="${datos.avatar}" alt="${datos.nickname}" width="40"></td>
                    <td>${datos.nickname}</td>
                    <td>${datos.elo}</td>
                    <td><img src="${banderaUrl}" alt="${datos.country}" width="30"></td>
                </tr>
            `;
            tablaBody.innerHTML += fila;
        }
    } else {
        tablaBody.innerHTML = "<tr><td colspan='6'>No se encontraron jugadores.</td></tr>";
    }
}

//Ejecutar la actualización al cargar la página
actualizarClasificacion();

//Actualizar cada 5 minutos automáticamente
setInterval(actualizarClasificacion, 300000);