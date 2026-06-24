import { useCountry } from "../CountryContext";

export default function HelpModal({ onClose }: { onClose: () => void }) {
  const { country } = useCountry();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>Ayuda</h2>
          <button className="secondary" onClick={onClose}>Cerrar</button>
        </div>

        <p className="muted">
          <strong>Personæ</strong> es una herramienta de investigación con poblaciones sintéticas:
          una biblioteca de personas modeladas según la realidad {country.gentilicio} ({country.fuenteDemografica}),
          focus groups conversacionales y encuestas cuantitativas, todo potenciado por IA. Cambia el
          país del escenario con el selector de la barra superior (España / Chile): población, focus
          y encuestas se adaptan al país, incluidos modismos, marcas y referencias locales.
        </p>

        <h3>Población sintética</h3>
        <ul className="help-list">
          <li><strong>Lista y filtros.</strong> Tabla paginada (10 por página) con filtros por nombre,
            edad (mín–máx), origen, residencia, ocupación, tags y fuente (IA / manual).</li>
          <li><strong>Generar con IA.</strong> Indicas perfil y cantidad y el modelo crea personas
            coherentes (sociodemografía, consumo, valores, bio). Puedes editarlas antes de guardar.</li>
          <li><strong>Nueva manual / Editar / Archivar.</strong> Alta y edición campo a campo; el
            archivado es reversible (no borra históricos).</li>
          <li><strong>Fichas de estadística.</strong> Pirámide demográfica (edad×sexo, tono claro =
            nacidos fuera), mapa territorial, género, nivel de ingresos y de educación. Todas se
            recalculan con los filtros activos.</li>
          <li><strong>Son interactivas.</strong> Haz <em>clic</em> en cualquier barra, sector del
            donut, franja de la pirámide o zona del mapa para <strong>autofiltrar</strong> toda la
            población por ese criterio (se combinan entre sí; vuelve a clicar para quitarlo).</li>
          <li><strong>Mapa.</strong> Mapa de calor por nº de personas y región (en España, además,
            por provincias); pasa el ratón para ver el detalle y clic para filtrar.</li>
          <li><strong>Educación.</strong> Pasa el ratón por cada nivel para ver qué comprende.</li>
        </ul>

        <h3>Focus Groups</h3>
        <ul className="help-list">
          <li><strong>Recruiting.</strong> Describe el público objetivo y la cantidad; la IA propone
            candidatos de la biblioteca; puedes cambiar uno por otro o ajustar a mano.</li>
          <li><strong>Chat en vivo.</strong> El moderador (tú) escribe preguntas. Con <em>Dirigir a</em>
            eliges quién responde (todos, varios o una persona). Las respuestas aparecen palabra a
            palabra y cada persona responde teniendo en cuenta lo ya dicho.</li>
          <li><strong>Orden y matices.</strong> El orden de respuesta es aleatorio; si pides en el
            texto que alguien empiece (“Carlos, empieza tú”), abrirá esa persona.</li>
          <li><strong>Interrumpir.</strong> Mientras responden, el botón pasa a <em>Interrumpir</em>
            para detener el turno.</li>
          <li><strong>Informe.</strong> Genera un informe del focus (resumen, temas, consensos, citas,
            recomendaciones) y descárgalo en <strong>PDF, Word o Excel</strong>. Puedes cerrarlo y
            volver a generarlo.</li>
        </ul>

        <h3>Encuestas</h3>
        <ul className="help-list">
          <li><strong>Cuestionario.</strong> Añade preguntas y elige el tipo: opción única, opción
            múltiple, Sí/No, escala 1–5, NPS 0–10 o <strong>pregunta abierta</strong> (texto libre).
            En única/múltiple, escribe las opciones separadas por coma.</li>
          <li><strong>Muestra.</strong> Elige el método: <em>Representativa</em> (cuotas edad×sexo según
            {country.fuenteDemografica}), <em>Aleatoria simple</em> o <em>Segmento</em> (por filtros), e indica el tamaño (N).</li>
          <li><strong>Modelo.</strong> Seleccionas el modelo de IA por encuesta (GPT-4o rápido o
            GPT-5.5 con razonamiento). Cada persona responde el cuestionario en su personaje.</li>
          <li><strong>Resultados en vivo.</strong> Las gráficas se actualizan a medida que entran las
            respuestas: distribución y % por opción, media y NPS donde aplica, y verbatims (citas) en
            las preguntas abiertas.</li>
          <li><strong>Cruces.</strong> Selecciona una variable (género, edad, región, ingresos,
            educación) para ver la tabla cruzada por segmento.</li>
          <li><strong>Exportar.</strong> Descarga todo a <strong>Excel</strong> (respuestas crudas +
            tablas de resultados).</li>
        </ul>

        <h3>Apariencia</h3>
        <ul className="help-list">
          <li><strong>Tema claro / oscuro.</strong> Botón con sol/luna arriba a la derecha; se recuerda
            tu elección.</li>
        </ul>

        <h3>Inteligencia artificial</h3>
        <ul className="help-list">
          <li><strong>Focus group e informe:</strong> GPT-5.5 con razonamiento alto (respuestas más
            ricas; algo más lentas).</li>
          <li><strong>Creación de personas y recruiting:</strong> GPT-4o (rápido).</li>
          <li><strong>Encuestas:</strong> modelo configurable por encuesta (GPT-4o por defecto;
            GPT-5.5 con razonamiento si quieres respuestas más elaboradas).</li>
        </ul>

        <p className="muted" style={{ marginTop: "0.75rem" }}>
          Los datos buscan reflejar la población {country.gentilicio} adulta (18+) según {country.fuenteDemografica}:
          pirámide edad×sexo, distribución por región, nivel de estudios y de renta,
          con coherencia entre variables.
        </p>

        <h3>Conclusión</h3>
        <p className="muted">
          La utilidad de Personæ no es acertar el número real, es barrer terreno barato y rápido
          antes de gastar en campo: descartar ideas malas, generar hipótesis, pre-testear un
          cuestionario, ensayar un focus. Es un instrumento de <strong>exploración</strong>, no de
          validación. No debemos comparar esta solución con la encuesta real. El trabajo es decidir
          qué llevar a la encuesta real.
        </p>
        <p className="muted">
          <strong>En una frase:</strong> no reemplaza a tu cliente, te ayuda a no malgastar plata
          averiguando qué preguntarle.
        </p>
      </div>
    </div>
  );
}
