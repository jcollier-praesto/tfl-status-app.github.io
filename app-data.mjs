export const TFL_LINES = {
    bakerloo: { name: 'Bakerloo' },
    central: { name: 'Central' },
    circle: { name: 'Circle' },
    district: { name: 'District' },
    'hammersmith-city': { name: 'Hammersmith & City' },
    jubilee: { name: 'Jubilee' },
    metropolitan: { name: 'Metropolitan' },
    northern: { name: 'Northern' },
    piccadilly: { name: 'Piccadilly' },
    victoria: { name: 'Victoria' },
    'waterloo-city': { name: 'Waterloo & City' }
};

        // Station Nodes with TfL Naptan IDs for live arrivals querying
        export const LINE_STATION_NODES = {
            'bakerloo': [
                { name: 'Paddington', naptan: '940GZZLUPAD', lat: 51.5154, lon: -0.1755 },
                { name: 'Baker Street', naptan: '940GZZLUBST', lat: 51.5226, lon: -0.1571 },
                { name: 'Oxford Circus', naptan: '940GZZLUOXC', lat: 51.5150, lon: -0.1415 },
                { name: 'Waterloo', naptan: '940GZZLUWLO', lat: 51.5031, lon: -0.1132 },
                { name: 'Elephant & Castle', naptan: '940GZZLUELE', lat: 51.4945, lon: -0.1006 }
            ],
            'central': [
                { name: 'Ealing Broadway', naptan: '940GZZLUEAB', lat: 51.5150, lon: -0.3017 },
                { name: 'Notting Hill Gate', naptan: '940GZZLUNHG', lat: 51.5091, lon: -0.1961 },
                { name: 'Oxford Circus', naptan: '940GZZLUOXC', lat: 51.5150, lon: -0.1415 },
                { name: 'Bank', naptan: '940GZZLUBNK', lat: 51.5133, lon: -0.0890 },
                { name: 'Stratford', naptan: '940GZZLUSTD', lat: 51.5416, lon: -0.0034 }
            ],
            'circle': [
                { name: 'Paddington', naptan: '940GZZLUPAD', lat: 51.5154, lon: -0.1755 },
                { name: 'King\'s Cross St. Pancras', naptan: '940GZZLUKSX', lat: 51.5308, lon: -0.1238 },
                { name: 'Tower Hill', naptan: '940GZZLUTWH', lat: 51.5098, lon: -0.0766 },
                { name: 'Victoria', naptan: '940GZZLUVIC', lat: 51.4965, lon: -0.1447 }
            ],
            'district': [
                { name: 'Richmond', naptan: '940GZZLURMD', lat: 51.4632, lon: -0.3013 },
                { name: 'Earl\'s Court', naptan: '940GZZLUECT', lat: 51.4920, lon: -0.1931 },
                { name: 'Westminster', naptan: '940GZZLUWMS', lat: 51.5014, lon: -0.1248 },
                { name: 'Monument', naptan: '940GZZLUMON', lat: 51.5107, lon: -0.0863 },
                { name: 'Barking', naptan: '940GZZLUBKG', lat: 51.5396, lon: 0.0810 }
            ],
            'hammersmith-city': [
                { name: 'Hammersmith', naptan: '940GZZLUHMD', lat: 51.4936, lon: -0.2251 },
                { name: 'Baker Street', naptan: '940GZZLUBST', lat: 51.5226, lon: -0.1571 },
                { name: 'King\'s Cross St. Pancras', naptan: '940GZZLUKSX', lat: 51.5308, lon: -0.1238 },
                { name: 'Liverpool Street', naptan: '940GZZLULVT', lat: 51.5178, lon: -0.0823 }
            ],
            'jubilee': [
                { name: 'Wembley Park', naptan: '940GZZLUWYP', lat: 51.5635, lon: -0.2796 },
                { name: 'Baker Street', naptan: '940GZZLUBST', lat: 51.5226, lon: -0.1571 },
                { name: 'London Bridge', naptan: '940GZZLULBG', lat: 51.5048, lon: -0.0860 },
                { name: 'Canary Wharf', naptan: '940GZZLUCWY', lat: 51.5039, lon: -0.0187 },
                { name: 'Stratford', naptan: '940GZZLUSTD', lat: 51.5416, lon: -0.0034 }
            ],
            'metropolitan': [
                { name: 'Harrow-on-the-Hill', naptan: '940GZZLUHOH', lat: 51.5793, lon: -0.3365 },
                { name: 'Baker Street', naptan: '940GZZLUBST', lat: 51.5226, lon: -0.1571 },
                { name: 'King\'s Cross St. Pancras', naptan: '940GZZLUKSX', lat: 51.5308, lon: -0.1238 },
                { name: 'Aldgate', naptan: '940GZZLUALD', lat: 51.5143, lon: -0.0757 }
            ],
            'northern': [
                { name: 'Camden Town', naptan: '940GZZLUCTN', lat: 51.5392, lon: -0.1426 },
                { name: 'King\'s Cross St. Pancras', naptan: '940GZZLUKSX', lat: 51.5308, lon: -0.1238 },
                { name: 'Waterloo', naptan: '940GZZLUWLO', lat: 51.5031, lon: -0.1132 },
                { name: 'London Bridge', naptan: '940GZZLULBG', lat: 51.5048, lon: -0.0860 }
            ],
            'piccadilly': [
                { name: 'Heathrow Airport', naptan: '940GZZLUHRC', lat: 51.4713, lon: -0.4527 },
                { name: 'South Kensington', naptan: '940GZZLUSSK', lat: 51.4941, lon: -0.1738 },
                { name: 'Piccadilly Circus', naptan: '940GZZLUPCC', lat: 51.5100, lon: -0.1342 },
                { name: 'King\'s Cross St. Pancras', naptan: '940GZZLUKSX', lat: 51.5308, lon: -0.1238 }
            ],
            'victoria': [
                { name: 'King\'s Cross St. Pancras', naptan: '940GZZLUKSX', lat: 51.5308, lon: -0.1238 },
                { name: 'Oxford Circus', naptan: '940GZZLUOXC', lat: 51.5150, lon: -0.1415 },
                { name: 'Victoria', naptan: '940GZZLUVIC', lat: 51.4965, lon: -0.1447 },
                { name: 'Brixton', naptan: '940GZZLUBRX', lat: 51.4626, lon: -0.1149 }
            ],
            'waterloo-city': [
                { name: 'Waterloo', naptan: '940GZZLUWLO', lat: 51.5031, lon: -0.1132 },
                { name: 'Bank', naptan: '940GZZLUBNK', lat: 51.5133, lon: -0.0890 }
            ]
        };

        