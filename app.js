async function render(){
  let q=$("search").value.toLowerCase(),
      c=$("cat").value;

  let list=photos.filter(p =>
    (c==="All" || p.category===c) &&
    p.original_name.toLowerCase().includes(q)
  );

  $("count").textContent =
    photos.length+" "+(photos.length===1?"Photo":"Photos");

  $("empty").classList.toggle("hide",list.length>0);

  const gallery=$("gallery");

  // Build everything separately first
  const fragment=document.createDocumentFragment();

  for(let p of list){
    let {data,error}=await S.storage
      .from(B)
      .createSignedUrl(p.storage_path,3600);

    if(error) continue;

    let d=document.createElement("article");

    d.innerHTML=`
      <img src="${data.signedUrl}" alt="">
      <div>
        <strong>${esc(p.original_name)}</strong>
        <small>${esc(p.category)} · ${bytes(p.size_bytes)}</small>
        <span>
          <button>↗</button>
          <button>↓</button>
          <button>×</button>
        </span>
      </div>
    `;

    let bs=d.querySelectorAll("span button");

    d.querySelector("img").onclick=() =>
      openLight(data.signedUrl,p.original_name);

    bs[0].onclick=() =>
      openLight(data.signedUrl,p.original_name);

    bs[1].onclick=() =>
      download(data.signedUrl,p.original_name);

    bs[2].onclick=() =>
      del(p);

    fragment.appendChild(d);
  }

  // Replace gallery only once
  gallery.replaceChildren(fragment);
}
