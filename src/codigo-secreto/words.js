// Pozo de palabras del tablero. Todas en singular, sin espacios y sin nombres propios,
// para que puedan usarse como pista sin ambigüedad.
export const WORD_POOL = [
  // naturaleza y geografía
  'sol','luna','estrella','playa','montaña','río','bosque','desierto','océano','isla',
  'valle','colina','pantano','selva','pradera','glaciar','iceberg','oasis','cráter','cañón',
  'laguna','bahía','costa','península','continente','manantial','catarata','marea','corriente','horizonte',
  'sendero','llanura','lago','charco','barro','pasto','monte','piedra','roca','tierra',

  // clima y fenómenos
  'fuego','humo','nube','lluvia','nieve','viento','trueno','relámpago','arcoíris','volcán',
  'terremoto','huracán','cascada','cueva','niebla','granizo','tormenta','inundación','avalancha','eclipse',
  'brisa','ceniza','lava','chispa','llama','sombra','calor','frío','helada','temporal',

  // animales
  'caballo','león','tigre','elefante','jirafa','mono','serpiente','águila','tiburón','ballena',
  'delfín','pulpo','araña','mariposa','abeja','hormiga','pingüino','oso','lobo','zorro',
  'conejo','ardilla','erizo','murciélago','búho','halcón','cuervo','paloma','gallo','pato',
  'cisne','flamenco','tortuga','cocodrilo','lagarto','camaleón','rana','sapo','caracol','gusano',
  'escorpión','cangrejo','langosta','medusa','salmón','trucha','sardina','atún','perro','gato',
  'camello','canguro','koala','panda','rinoceronte','hipopótamo','cebra','toro','vaca','cerdo',
  'reno','alce','ciervo','jabalí','nutria','castor','mapache','chivo','topo','rata',
  'ratón','hámster','loro','tucán','colibrí','avestruz','pavo','ganso','cigüeña','gaviota',
  'cóndor','mosquito','mosca','grillo','saltamontes','libélula','luciérnaga','oruga','pulga','garrapata',
  'polilla','avispa','pájaro','lechuza','bicho','canario',

  // tecnología
  'robot','computadora','teléfono','internet','satélite','cohete','planeta','galaxia','telescopio','microscopio',
  'pantalla','teclado','batería','antena','cable','circuito','chip','motor','engranaje','imán',
  'láser','radar','dron','contraseña','virus','código','señal','radio','televisor','impresora',
  'escáner','sensor','pila','enchufe','interruptor','consola','joystick','auricular','proyector','bombilla',
  'generador','panel','celular','parlante','cargador','mouse','tablet','wifi','bluetooth','cámara',

  // lugares
  'hospital','escuela','biblioteca','museo','teatro','estadio','aeropuerto','estación','mercado','restaurante',
  'hotel','piscina','jardín','parque','cocina','dormitorio','garaje','sótano','techo','ventana',
  'fábrica','taller','oficina','banco','farmacia','panadería','carnicería','peluquería','comisaría','cuartel',
  'iglesia','templo','cementerio','prisión','embajada','faro','puerto','muelle','plaza','avenida',
  'callejón','autopista','túnel','frontera','aduana','refugio','campamento','granja','establo','molino',
  'viñedo','acuario','zoológico','circo','boliche','cancha','kiosco','cine','bar','shopping',

  // casa y objetos
  'puerta','escalera','ascensor','espejo','reloj','calendario','mapa','brújula','linterna',
  'lápiz','cuaderno','mochila','billetera','llave','candado','cadena','anillo','collar','corona',
  'almohada','colchón','manta','sábana','cortina','alfombra','lámpara','silla','mesa','sillón',
  'armario','cajón','estante','perchero','maceta','florero','jarra','taza','plato','cuchara',
  'tenedor','cuchillo','olla','sartén','horno','heladera','tostadora','licuadora','batidor','escoba',
  'balde','esponja','jabón','toalla','cepillo','peine','tijera','aguja','hilo','botón',
  'cierre','paraguas','vela','fósforo','encendedor','basurero','termo','vaso','almohadón','frazada',

  // música y arte
  'guitarra','piano','tambor','violín','trompeta','micrófono','altavoz','libro','revista','periódico',
  'flauta','saxofón','acordeón','pandereta','maraca','melodía','ritmo','pincel','acuarela','escultura',
  'estatua','mural','retrato','paisaje','galería','marco','poema','novela','cuento','guion',
  'escenario','telón','máscara','disfraz','maquillaje','vestuario','canción','recital','dibujo','tema',

  // herramientas y armas
  'espada','escudo','arco','flecha','lanza','martillo','hacha','sierra','tornillo','clavo',
  'destornillador','pinza','taladro','lima','pala','rastrillo','carretilla','andamio','ladrillo','cemento',
  'pintura','rodillo','nivel','regla','metro','balanza','termómetro','cuerda','red','ancla',
  'arpón','navaja','palo','cinta','tuerca','alambre','pegamento','bomba','rifle',

  // transporte
  'barco','submarino','avión','helicóptero','tren','autobús','bicicleta','motocicleta','camión','tractor',
  'globo','paracaídas','canoa','kayak','balsa','yate','velero','ferry','trineo','patineta',
  'patín','monopatín','subte','taxi','ambulancia','carruaje','vagón','locomotora','cápsula','nave',
  'carro','remolque','grúa','excavadora','colectivo','bici','moto','camioneta','avioneta','skate',

  // materiales
  'plata','hierro','madera','arena','hielo','oro','diamante','moneda','tesoro','bronce',
  'cobre','acero','plomo','mármol','granito','arcilla','vidrio','cristal','papel','cartón',
  'plástico','goma','cuero','lana','seda','algodón','carbón','petróleo','azufre','mercurio',
  'sal','perla','rubí','esmeralda','zafiro','cuarzo','fósil','meteorito','tela','chapa',
  'aluminio','polvo','metal',

  // fantasía y misterio
  'pirámide','laberinto','fantasma','vampiro','bruja','mago','hada','gigante','enano','alien',
  'dragón','unicornio','sirena','centauro','fénix','ogro','duende','zombi','momia','demonio',
  'ángel','hechizo','poción','amuleto','varita','caldero','portal','dimensión','leyenda','castillo',
  'torre','muralla','foso','mazmorra','trono','catedral','hombrelobo','monstruo','criatura','adivino',
  'visión','joya','cofre','carta','símbolo','bastón','figura','calabozo',

  // cuerpo
  'cerebro','corazón','esqueleto','calavera','pulmón','hígado','riñón','estómago','columna','costilla',
  'músculo','vena','sangre','piel','cabello','barba','ceja','pestaña','hombro','codo',
  'muñeca','rodilla','tobillo','talón','pulgar','uña','lengua','garganta','mano','pie',

  // comida
  'pastel','helado','chocolate','café','queso','pan','huevo','pescado','pollo','regalo',
  'limón','manzana','banana','uva','sandía','piña','coco','frutilla','cereza','durazno',
  'pera','ciruela','higo','mango','papaya','melón','kiwi','granada','mandarina','pomelo',
  'tomate','papa','cebolla','zanahoria','lechuga','espinaca','brócoli','pepino','pimiento','calabaza',
  'zapallo','choclo','arroz','fideo','harina','azúcar','miel','manteca','aceite','vinagre',
  'pimienta','canela','vainilla','jengibre','ajo','perejil','orégano','albahaca','mostaza','mayonesa',
  'galleta','torta','budín','flan','caramelo','chicle','turrón','mermelada','yogur','leche',
  'sopa','guiso','ensalada','sándwich','empanada','asado','milanesa','hamburguesa','pizza','tarta',
  'mate','factura','naranja',

  // plantas
  'cactus','rosa','girasol','árbol','hoja','semilla','raíz','tallo','espina','pétalo',
  'tulipán','orquídea','margarita','lavanda','jazmín','clavel','amapola','helecho','musgo','alga',
  'roble','pino','palmera','olivo','bambú','trigo','maíz','césped','enredadera','tronco',
  'corteza','rama','polen','néctar','flor','planta','arbusto','caña',

  // deportes y juegos
  'pelota','raqueta','aro','portería','malla','pista','gimnasio','trofeo','medalla','ajedrez',
  'dado','naipe','ficha','tablero','dardo','billar','bolos','rompecabezas','crucigrama','acertijo',
  'sudoku','trampolín','parapente','esquí','snowboard','surf','buceo','maratón','carrera','salto',
  'lucha','boxeo','esgrima','arquería','escalada','ciclismo','remo','fútbol',

  // profesiones
  'médico','enfermero','maestro','científico','ingeniero','abogado','juez','policía','bombero','soldado',
  'marinero','piloto','astronauta','chef','panadero','carpintero','zapatero','joyero','pintor','escultor',
  'músico','actor','bailarín','escritor','poeta','periodista','fotógrafo','arquitecto','granjero','pescador',
  'cazador','jardinero','mecánico','electricista','detective','espía','pirata','vaquero','caballero','samurái',
  'ninja','gladiador','faraón','emperador','rey','reina','príncipe','princesa','mozo','chofer',
  'cocinero','vecino','cantante','comediante','cura','guardia','jefe','empleado',

  // ropa
  'camisa','pantalón','vestido','falda','abrigo','bufanda','guante','sombrero','gorra','casco',
  'zapato','bota','sandalia','media','cinturón','corbata','bolsillo','capa','uniforme','pijama',
  'traje','armadura','pulsera','remera','buzo','campera','lentes','gorro','zapatilla','jean',

  // escuela y oficina
  'pizarra','tiza','borrador','carpeta','archivo','sello','sobre','estampilla','tinta','pluma',
  'diccionario','enciclopedia','agenda','informe','contrato','recibo','planilla','gráfico','examen','tarea',
  'lección','recreo','cartuchera','timbre','bandera','escritorio','lapicera','diario',

  // tiempo y medidas
  'segundo','minuto','hora','día','semana','mes','año','siglo','amanecer','atardecer',
  'mediodía','medianoche','invierno','primavera','verano','otoño','ciclo','kilómetro','centímetro','gramo',
  'litro','grado','porcentaje','fracción','número','cifra','cero','época','tiempo',

  // abstractos y varios
  'silencio','eco','secreto','misterio','enigma','susurro','clave','mensaje','rumor','mentira',
  'verdad','promesa','memoria','sueño','pesadilla','deseo','miedo','valor','suerte','destino',
  'sorpresa','fiesta','carnaval','desfile','ceremonia','boda','aniversario','concurso','aventura','viaje',
  'expedición','naufragio','rescate','fuga','persecución','testigo','huella','rastro','sospecha','prueba',
  'indicio','trampa','escondite','guarida','payaso','marioneta','juguete','trompo','cometa','burbuja',
  'confeti','serpentina','campana','gong','silbato','bocina','bombo','cuerno','triángulo','negocio',
  'excusa','carnada','juego','muñeco','alarma','desafío','meme',
];
