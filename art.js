/* Original model catalogue. PNG previews are baked from the same 3D geometry. */
(function(root){
  const names={
    goose:'大白鹅',tomato:'熟番茄',corn:'甜玉米',egg:'鲜鸡蛋',carrot:'胡萝卜',mushroom:'白蘑菇',
    radish:'白萝卜',pumpkin:'小南瓜',pear:'香雪梨',strawberry:'草莓',eggplant:'紫茄子',bread:'乡村面包',
    broccoli:'西兰花',cucumber:'黄瓜',pepper:'甜椒',potato:'土豆',apple:'红苹果',orange:'甜橙',
    banana:'香蕉',kiwi:'猕猴桃',watermelon:'西瓜',grape:'葡萄',peach:'蜜桃',lemon:'柠檬',
    avocado:'牛油果',croissant:'牛角包',sushi:'寿司卷',salmon:'三文鱼',donut:'甜甜圈',pretzel:'碱水结',
    cookie:'曲奇',baguette:'法棍',cupcake:'纸杯蛋糕',waffle:'华夫饼',toast:'吐司',chocolate:'巧克力',
    sandwich:'三明治',milk:'鲜牛奶',sausage:'香肠',shrimp:'鲜虾',scallop:'扇贝',mussel:'青口贝',
    riceball:'饭团',juice:'果汁'
  };
  const image=id=>root.GooseAssetData?.[`assets/items/${id}.png`]||`assets/items/${id}.png?v=20260910`;
  root.GooseArt={
    items:Object.fromEntries(Object.entries(names).map(([id,name])=>[id,{id,name}])),
    image,
    goose:(index=0)=>image('goose-'+index)
  };
})(globalThis);
