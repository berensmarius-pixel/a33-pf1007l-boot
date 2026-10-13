// 24 kuratierte High-Protein Alltagsrezepte (Airfryer, Reiskocher One-Pot, Backofen-Blech, 15-Min-Pfanne)
(function () {
  'use strict';

  var RECIPES = [
    // ---------------------------------------------------- 🍟 Airfryer
    {
      id: 'rcp_af_1',
      title: 'Crispy Cornflakes Chicken Strips',
      category: 'airfryer',
      badge: 'Airfryer',
      time: 15,
      protein: 48,
      calories: 420,
      description: 'Super knusprig ohne Öl – außen kross, innen saftig.',
      ingredients: ['350g Hähnchenbrustfilet', '45g ungesüßte Cornflakes', '1 Ei', '1 TL Paprikapulver edelsüß', '1/2 TL Knoblauchpulver', 'Salz & Pfeffer'],
      steps: [
        'Hähnchenbrust in fingerdicke Streifen schneiden und mit Paprika, Knoblauch, Salz würzen.',
        'Ei verquirlen. Cornflakes in einer Schüssel mit den Händen grob zerbröseln.',
        'Hähnchen erst im Ei, dann in den Cornflakes wenden und leicht andrücken.',
        '12 Minuten bei 195°C im Airfryer backen, bis sie goldbraun und kross sind.'
      ]
    },
    {
      id: 'rcp_af_2',
      title: 'Lachsfilet mit knusprigem Brokkoli',
      category: 'airfryer',
      badge: 'Airfryer',
      time: 12,
      protein: 44,
      calories: 460,
      description: 'In 12 Minuten perfekt glasig mit Röstnoten am Brokkoli.',
      ingredients: ['250g Lachsfilet', '200g Brokkoliröschen', '1 EL Sojasauce', '1 TL Honig oder Ahornsirup', '1 Spritzer Zitronensaft', 'Salz'],
      steps: [
        'Lachs mit Sojasauce und Honig dünn bestreichen.',
        'Brokkoli mit etwas Salz vermengen.',
        'Beides nebeneinander in den Airfryer-Korb legen.',
        'Bei 180°C für 10-12 Minuten garen.'
      ]
    },
    {
      id: 'rcp_af_3',
      title: 'High-Protein Cheeseburger Tacos',
      category: 'airfryer',
      badge: 'Airfryer',
      time: 12,
      protein: 52,
      calories: 530,
      description: 'Der virale Smash-Taco Trend – fettarm, saftig und in 10 Min fertig.',
      ingredients: ['250g Rinderhack mager', '2 Mini-Tortilla-Wraps', '2 Scheiben fettarmer Cheddar (oder Gouda)', '2 Gewürzgurken', '1 EL Senf & Ketchup', 'Salz & Pfeffer'],
      steps: [
        'Hackfleisch mit Salz und Pfeffer dünn direkt auf die beiden Wraps drücken.',
        'Mit der Fleischseite nach unten für 6 Minuten bei 200°C in den Airfryer legen.',
        'Wenden, je eine Scheibe Käse auflegen und 2 Minuten schmelzen lassen.',
        'Mit geschnittenen Gewürzgurken, Senf und Ketchup zusammenklappen.'
      ]
    },
    {
      id: 'rcp_af_4',
      title: 'Knuspriges Teriyaki-Hähnchen mit Paprika',
      category: 'airfryer',
      badge: 'Airfryer',
      time: 15,
      protein: 46,
      calories: 410,
      description: 'Würzige Hähnchenbites mit knackiger Paprika und Sesam.',
      ingredients: ['350g Hähnchenbrust', '1 rote Paprika', '3 EL Teriyaki-Sauce', '1 TL Sesam', '1 Knoblauchzehe gepresst'],
      steps: [
        'Hähnchen und Paprika in mundgerechte Stücke schneiden.',
        'Mit Teriyaki-Sauce und Knoblauch kurz vermengen.',
        '14 Minuten bei 190°C in den Airfryer geben (nach 7 Min einmal schütteln).',
        'Mit Sesam bestreuen und sofort servieren.'
      ]
    },
    {
      id: 'rcp_af_5',
      title: 'Gefüllte Protein-Burritos mit Hack & Skyr',
      category: 'airfryer',
      badge: 'Airfryer',
      time: 10,
      protein: 48,
      calories: 490,
      description: 'Außen wie ein krosser Chimichanga, innen cremig und vollgepackt.',
      ingredients: ['200g Rinderhack mager angebraten', '1 großer Vollkornwrap', '50g Reibekäse leicht', '2 EL Skyr oder Magerquark', '2 EL Salsa-Sauce'],
      steps: [
        'Wrap mittig mit Hackfleisch, Salsa, Skyr und Käse belegen.',
        'Die Seiten einschlagen und stramm einrollen.',
        'Mit der Naht nach unten bei 185°C für 8-10 Minuten in den Airfryer legen.',
        'In der Mitte durchschneiden und knusprig genießen.'
      ]
    },
    {
      id: 'rcp_af_6',
      title: 'Griechische Feta-Hähnchen Bites',
      category: 'airfryer',
      badge: 'Airfryer',
      time: 14,
      protein: 45,
      calories: 430,
      description: 'Mediterrane Aromen mit warmem, cremigem Feta.',
      ingredients: ['300g Hähnchenbrust', '80g Feta leicht', '100g Cherrytomaten', '1 TL Oregano', '1 EL Olivenöl', 'Salz'],
      steps: [
        'Hähnchenbrust würfeln, mit Olivenöl, Oregano und Salz marinieren.',
        'Zusammen mit ganzen Cherrytomaten und gewürfeltem Feta in den Korb geben.',
        '12-14 Minuten bei 190°C backen.',
        'Warm servieren – Tomaten platzen saftig auf.'
      ]
    },

    // ---------------------------------------------------- 🍚 Reiskocher One-Pot
    {
      id: 'rcp_rc_1',
      title: 'Teriyaki-Lachs mit Jasminreis & Edamame',
      category: 'ricecooker',
      badge: 'Reiskocher',
      time: 20,
      protein: 44,
      calories: 540,
      description: 'Alles in einem Durchgang gegart – Lachs dämpft saftig auf dem Reis.',
      ingredients: ['250g Lachsfilet', '150g Jasminreis', '100g TK-Edamame', '3 EL Teriyaki-Sauce', '1 Frühlingszwiebel'],
      steps: [
        'Reis waschen und mit normaler Wassermenge in den Reiskocher füllen.',
        'Edamame darüberstreuen.',
        'Lachs mit Teriyaki bestreichen und oben auf den Reis legen.',
        'Reiskocher starten. Nach Garzeit Lachs herausnehmen oder direkt zerkleinern und mit Frühlingszwiebeln vermengen.'
      ]
    },
    {
      id: 'rcp_rc_2',
      title: 'Cremiges Hähnchen-Pilz-Reis One-Pot',
      category: 'ricecooker',
      badge: 'Reiskocher',
      time: 22,
      protein: 48,
      calories: 510,
      description: 'Schmeckt wie ein sündiges Risotto, hat aber Top-Makros.',
      ingredients: ['300g Hähnchenbrust gewürfelt', '150g Reis', '150g Champignons geschnitten', '200ml Gemüsebrühe', '2 EL Frischkäse leicht', 'Petersilie'],
      steps: [
        'Reis, Champignons und Gemüsebrühe in den Reiskocher geben.',
        'Gewürfeltes Hähnchen oben auflegen.',
        'Reiskocher-Programm starten.',
        'Nach Fertigstellung den Frischkäse unterrühren für eine samtige Cremigkeit.'
      ]
    },
    {
      id: 'rcp_rc_3',
      title: 'Mexikanische Beef-Reis-Bowl',
      category: 'ricecooker',
      badge: 'Reiskocher',
      time: 20,
      protein: 47,
      calories: 530,
      description: 'Würzige Burrito-Bowl ohne Pfannen-Chaos – alles aus einem Topf.',
      ingredients: ['250g Rinderhack mager', '150g Reis', '1/2 Dose Kidneybohnen', '1/2 Dose Mais', '200ml stückige Tomaten', '1 EL Taco-Gewürz'],
      steps: [
        'Reis mit stückigen Tomaten und etwas Wasser in den Topf füllen.',
        'Hackfleisch mit Taco-Gewürz vermengen und als kleine Bällchen oder Flocken auflegen.',
        'Kidneybohnen und Mais dazugeben und Reiskocher starten.',
        'Am Ende einmal kräftig durchrühren.'
      ]
    },
    {
      id: 'rcp_rc_4',
      title: 'Tomaten-Hähnchenreis mit Kräutern & Feta',
      category: 'ricecooker',
      badge: 'Reiskocher',
      time: 20,
      protein: 45,
      calories: 490,
      description: 'Der Reis saugt den vollen Tomatengeschmack auf.',
      ingredients: ['300g Hähnchenbrust', '150g Reis', '1 Dose gehackte Tomaten', '70g Feta leicht', '1 TL italienische Kräuter', 'Salz'],
      steps: [
        'Reis mit der Dose Tomaten und etwas Wasser verrühren.',
        'Hähnchenbrust würzen und ganz oder in Stücken auflegen.',
        'Starten. Nach Ende der Garzeit den Feta zerbröseln und unterheben.'
      ]
    },
    {
      id: 'rcp_rc_5',
      title: 'Curry-Hähnchen mit Kokosreis & Erbsen',
      category: 'ricecooker',
      badge: 'Reiskocher',
      time: 22,
      protein: 46,
      calories: 520,
      description: 'Aromatisches gelbes Curry mit zarter Hähnchenbrust.',
      ingredients: ['300g Hähnchenbrust', '150g Basmatireis', '100ml fettarme Kokosmilch', '150ml Brühe', '1 EL mildes Currypulver', '80g TK-Erbsen'],
      steps: [
        'Reis, Kokosmilch, Brühe und Currypulver im Reiskocher verrühren.',
        'Erbsen und gewürfelte Hähnchenbrust dazugeben.',
        'Reiskocher kochen lassen. Vor dem Essen kurz durchmischen.'
      ]
    },
    {
      id: 'rcp_rc_6',
      title: 'Thunfisch-Zucchini-Reisbowl mit Soja & Sesam',
      category: 'ricecooker',
      badge: 'Reiskocher',
      time: 18,
      protein: 42,
      calories: 460,
      description: 'Einfacher geht es nicht – blitzschnell, leicht und proteinreich.',
      ingredients: ['2 Dosen Thunfisch im eigenen Saft', '150g Reis', '1 Zucchini geraspelt', '2 EL Sojasauce', '1 TL Sesamöl'],
      steps: [
        'Reis und geraspelte Zucchini mit Wasser im Reiskocher kochen.',
        'Sobald fertig: abgetropften Thunfisch, Sojasauce und Sesamöl unterheben.',
        '2 Minuten ziehen lassen und genießen.'
      ]
    },

    // ---------------------------------------------------- 🥘 Backofen / Blechgerichte
    {
      id: 'rcp_ov_1',
      title: 'Griechisches Zitronen-Hähnchen mit Feta & Zucchini',
      category: 'oven',
      badge: 'Backofen',
      time: 25,
      protein: 48,
      calories: 470,
      description: 'Alles auf ein Backblech werfen, Backofen an, fertig. Null Aufwand.',
      ingredients: ['400g Hähnchenbrust', '1 Zucchini', '1 Paprika', '100g Feta leicht', '1/2 Zitrone', '1 TL Oregano', '1 EL Olivenöl'],
      steps: [
        'Hähnchen, Zucchini und Paprika in mundgerechte Stücke schneiden.',
        'Auf ein mit Backpapier belegtes Blech geben. Mit Öl, Zitronensaft, Oregano, Salz würzen.',
        'Feta darüberbröseln.',
        'Bei 200°C Ober-/Unterhitze 22 Minuten backen.'
      ]
    },
    {
      id: 'rcp_ov_2',
      title: 'Bunte Fajita-Blechpfanne mit Hähnchen',
      category: 'oven',
      badge: 'Backofen',
      time: 20,
      protein: 46,
      calories: 440,
      description: 'Rauchig-würziges Fajita-Hähnchen mit gerösteter Paprika und Zwiebeln.',
      ingredients: ['350g Hähnchenbrust in Streifen', '2 Paprika bunt', '1 rote Zwiebel', '1 EL Fajita-Gewürz', '1 EL Öl', '1 Limette'],
      steps: [
        'Hähnchen und Gemüse in Streifen schneiden.',
        'Mit Öl und Fajita-Gewürz direkt auf dem Blech vermengen.',
        'Bei 200°C für 20 Minuten backen.',
        'Mit Limettensaft beträufeln – pur oder in Wraps servieren.'
      ]
    },
    {
      id: 'rcp_ov_3',
      title: 'Knuspriges Lachs-Kartoffel-Blech',
      category: 'oven',
      badge: 'Backofen',
      time: 22,
      protein: 42,
      calories: 490,
      description: 'Frischer Lachs mit Röstkartoffeln und grünen Bohnen.',
      ingredients: ['250g Lachsfilet', '300g kleine Kartoffeln geviertelt', '150g grüne Bohnen', '1 Zweig Rosmarin', '1 EL Öl', 'Salz'],
      steps: [
        'Kartoffeln mit Öl, Rosmarin und Salz 10 Minuten bei 200°C vorbacken.',
        'Lachs und Bohnen dazulegen.',
        'Weitere 12 Minuten backen, bis der Lachs saftig und die Kartoffeln knusprig sind.'
      ]
    },
    {
      id: 'rcp_ov_4',
      title: 'High-Protein Quark-Pizza auf Blech',
      category: 'oven',
      badge: 'Backofen',
      time: 20,
      protein: 54,
      calories: 520,
      description: 'Echter Pizzageschmack mit 54g Protein und ohne Hefe-Wartezeit.',
      ingredients: ['200g Magerquark', '1 Ei', '70g Dinkelmehl oder Hafermehl', '1 TL Backpulver', '60ml Tomatensauce', '80g Reibekäse leicht', '50g Kochschinken oder Thunfisch'],
      steps: [
        'Quark, Ei, Mehl und Backpulver zu einem streichbaren Teig verrühren.',
        'Dünn auf Backpapier streichen und 10 Min bei 200°C vorbacken.',
        'Mit Tomatensauce, Schinken/Thunfisch und Käse belegen.',
        '8 Minuten goldgelb fertigbacken.'
      ]
    },
    {
      id: 'rcp_ov_5',
      title: 'Mediterranes Putensteak mit Tomaten & Mozzarella',
      category: 'oven',
      badge: 'Backofen',
      time: 22,
      protein: 50,
      calories: 460,
      description: 'Zartes Fleisch unter einer geschmolzenen Mozzarelladecke.',
      ingredients: ['350g Putensteaks', '200g Cherrytomaten', '1 Kugel Mozzarella leicht (125g)', '1 TL italienische Kräuter', 'Balsamico-Creme'],
      steps: [
        'Putensteaks würzen und aufs Blech legen.',
        'Cherrytomaten halbieren und drumherum verteilen.',
        'Mozzarella in Scheiben auf das Fleisch legen.',
        '20 Minuten bei 195°C überbacken. Mit Balsamico verfeinern.'
      ]
    },
    {
      id: 'rcp_ov_6',
      title: 'Cottage Cheese & Hackfleisch-Gratin',
      category: 'oven',
      badge: 'Backofen',
      time: 25,
      protein: 52,
      calories: 490,
      description: 'Cremig wie Lasagne, aber mit körnigem Frischkäse und Low-Carb.',
      ingredients: ['300g Rinderhack mager', '200g Körniger Frischkäse', '1 Zucchini gewürfelt', '1 Dose gehackte Tomaten', '1 TL Kräuter', 'Salz'],
      steps: [
        'Hackfleisch und Zucchini in eine Auflaufform geben.',
        'Tomaten und Kräuter unterrühren.',
        'Körnigen Frischkäse als cremige Schicht obenauf verstreichen.',
        '22 Minuten bei 200°C backen, bis die Kruste leicht bräunt.'
      ]
    },

    // ---------------------------------------------------- 🍳 15-Minuten Pfanne
    {
      id: 'rcp_pan_1',
      title: 'Cremige High-Protein Hähnchen-Penne',
      category: 'pan',
      badge: 'Schnell',
      time: 15,
      protein: 50,
      calories: 530,
      description: 'Restaurant-Niveau in 15 Minuten mit samtiger Frischkäse-Tomatensauce.',
      ingredients: ['300g Hähnchenbrust', '120g Penne', '150ml passierte Tomaten', '2 gehäufte EL Frischkäse leicht', '1 TL italienische Kräuter', 'Salz & Pfeffer'],
      steps: [
        'Penne in kochendem Salzwasser al dente kochen.',
        'Hähnchenstreifen in einer Pfanne 5 Minuten scharf anbraten.',
        'Passierte Tomaten, Frischkäse und Kräuter dazugeben und verrühren.',
        'Nudeln unterheben, kurz einkochen lassen und servieren.'
      ]
    },
    {
      id: 'rcp_pan_2',
      title: 'Rinderhack-Zucchini-Pfanne mit Feta',
      category: 'pan',
      badge: 'Schnell',
      time: 12,
      protein: 46,
      calories: 450,
      description: 'Deftig, würzig und in 12 Minuten auf dem Tisch.',
      ingredients: ['250g Rinderhack mager', '1 große Zucchini gewürfelt', '80g Feta leicht', '1 Knoblauchzehe', '1/2 TL Kreuzkümmel', 'Salz & Pfeffer'],
      steps: [
        'Hackfleisch krümelig anbraten.',
        'Zucchini und Knoblauch dazugeben und 5 Minuten mitbraten.',
        'Mit Kreuzkümmel, Salz und Pfeffer abschmecken.',
        'Feta darüberbröseln, Deckel auflegen und 2 Minuten schmelzen lassen.'
      ]
    },
    {
      id: 'rcp_pan_3',
      title: 'Asiatische Teriyaki-Hähnchen-Wokpfanne',
      category: 'pan',
      badge: 'Schnell',
      time: 14,
      protein: 45,
      calories: 430,
      description: 'Knackiges Gemüse, zartes Hähnchen und knusprige Cashews.',
      ingredients: ['300g Hähnchenbrust', '200g bunte Wok-Gemüsemischung', '3 EL Teriyaki-Sauce', '15g Cashewnüsse', '1 EL Öl'],
      steps: [
        'Hähnchen in heißem Öl 4 Minuten scharf anbraten.',
        'Gemüse dazugeben und 4 Minuten knackig braten.',
        'Teriyaki-Sauce und Cashews dazugeben, kurz schwenken und eindicken lassen.'
      ]
    },
    {
      id: 'rcp_pan_4',
      title: 'Shakshuka mit 3 Eiern & Feta',
      category: 'pan',
      badge: 'Schnell',
      time: 15,
      protein: 36,
      calories: 410,
      description: 'Pochierte Eier in einer fruchtig-würzigen Tomaten-Paprika-Sauce.',
      ingredients: ['3 Eier', '1 Dose stückige Tomaten', '1 rote Paprika gewürfelt', '50g Feta leicht', '1 TL Kreuzkümmel', '1 TL Paprikapulver'],
      steps: [
        'Paprika in der Pfanne anbraten, Tomaten und Gewürze dazugeben, 5 Min köcheln.',
        'Mit dem Löffel 3 Mulden formen und die Eier hineinschlagen.',
        'Feta darüberbröseln, Deckel auflegen und 5-6 Minuten stocken lassen.'
      ]
    },
    {
      id: 'rcp_pan_5',
      title: 'Cremige Thunfisch-Nudeln mit Erbsen',
      category: 'pan',
      badge: 'Schnell',
      time: 12,
      protein: 44,
      calories: 480,
      description: 'Schneller geht es kaum: Vorratskammer-Klassiker mit Top-Protein.',
      ingredients: ['1 Dose Thunfisch im eigenen Saft', '100g Nudeln', '80g TK-Erbsen', '2 EL Frischkäse leicht', '1 Spritzer Zitronensaft', 'Pfeffer'],
      steps: [
        'Nudeln zusammen mit den TK-Erbsen in einem Topf kochen.',
        'Wasser abgießen, zurück auf die heiße Platte.',
        'Thunfisch, Frischkäse und Zitronensaft direkt im Topf unterrühren und pfeffern.'
      ]
    },
    {
      id: 'rcp_pan_6',
      title: 'Fluffige Protein-Pancakes mit Beeren',
      category: 'pan',
      badge: 'Schnell',
      time: 10,
      protein: 42,
      calories: 380,
      description: 'Süßes Abendessen oder schnelles Power-Frühstück ohne Proteinpulver.',
      ingredients: ['150g Magerquark', '2 Eier', '40g gemahlene Haferflocken', '1/2 TL Backpulver', '100g Beeren frisch oder TK', '1 Spritzer Süßstoff'],
      steps: [
        'Quark, Eier, Haferflocken, Backpulver und Süßstoff mit einer Gabel glattrühren.',
        'In einer beschichteten Pfanne bei mittlerer Hitze 3-4 Pancakes backen.',
        'Einmal wenden und mit warmen oder frischen Beeren servieren.'
      ]
    }
  ];

  window.BASE_RECIPES = RECIPES;
  if (window.DATA) window.DATA.recipes = RECIPES.slice();
})();
