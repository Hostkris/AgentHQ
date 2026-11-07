// Open-Meteo WMO weather interpretation codes. Pure UI mapping; no added API or credentials.
export function condition(code,isDay=true){
 const n=Number(code),day=isDay===true||isDay===1||isDay==='1';
 if(n===0)return {label:'Clear sky',icon:day?'☀️':'🌙',group:'sunny'};
 if(n===1)return {label:'Mostly clear',icon:day?'🌤️':'🌙',group:'fair'};
 if(n===2)return {label:'Partly cloudy',icon:day?'⛅':'☁️',group:'partly-cloudy'};
 if(n===3)return {label:'Overcast',icon:'☁️',group:'cloudy'};
 if([45,48].includes(n))return {label:'Foggy',icon:'🌫️',group:'fog'};
 if([51,53,55].includes(n))return {label:'Drizzle',icon:'🌦️',group:'rain'};
 if([56,57,66,67].includes(n))return {label:'Freezing rain',icon:'🌧️',group:'rain'};
 if([61,63,65].includes(n))return {label:n===61?'Light rain':n===65?'Heavy rain':'Rain',icon:'🌧️',group:'rain'};
 if([80,81,82].includes(n))return {label:n===82?'Heavy showers':'Rain showers',icon:'🌦️',group:'rain'};
 if([71,73,75,77,85,86].includes(n))return {label:n===75||n===86?'Heavy snow':'Snow',icon:'🌨️',group:'snow'};
 if([95,96,97,99].includes(n))return {label:n>=96?'Thunderstorm with hail':'Thunderstorm',icon:'⛈️',group:'storm'};
 return {label:'Weather unavailable',icon:'🌡️',group:'unknown'};
}
